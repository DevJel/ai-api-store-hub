import type { Env } from "./types";
const MIN_TOPUP_PHP = 100;
const json = (data: unknown, status = 200) => Response.json(data, { status });

export async function createPayMongoCheckout(env: Env, tenantId: string, email: string, amountPhp: number, origin: string) {
  if (!env.PAYMONGO_SECRET_KEY) throw new Error("PayMongo is not configured");
  if (!Number.isSafeInteger(amountPhp) || amountPhp < MIN_TOPUP_PHP) throw new Error("Minimum wallet top-up is PHP 100");
  const id = crypto.randomUUID();
  const reference = `ASH-${id.replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  await env.DB.prepare(`INSERT INTO wallet_transactions (id, tenant_id, provider, reference_number, amount_php, status) VALUES (?, ?, 'paymongo', ?, ?, 'pending')`)
    .bind(id, tenantId, reference, amountPhp).run();

  const response = await fetch("https://api.paymongo.com/v2/checkout_sessions", {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(env.PAYMONGO_SECRET_KEY + ":")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { attributes: {
      line_items: [{ name: "AI API Store Hub wallet credit", amount: amountPhp * 100, currency: "PHP", quantity: 1 }],
      payment_method_types: ["card", "gcash", "qrph"],
      success_url: `${origin}/billing/success?reference=${encodeURIComponent(reference)}`,
      cancel_url: `${origin}/billing/cancel?reference=${encodeURIComponent(reference)}`,
      reference_number: reference, description: "Prepaid API usage wallet top-up",
      send_email_receipt: true, metadata: { wallet_transaction_id: id, tenant_id: tenantId },
    } } }),
  });
  const payload = await response.json() as any;
  if (!response.ok) {
    await env.DB.prepare("UPDATE wallet_transactions SET status='failed', provider_response=? WHERE id=?")
      .bind(JSON.stringify(payload).slice(0, 4000), id).run();
    throw new Error(payload?.errors?.[0]?.detail || "Unable to create PayMongo checkout");
  }
  const session = payload?.data, checkoutUrl = session?.attributes?.checkout_url;
  if (!session?.id || !checkoutUrl) throw new Error("PayMongo returned an invalid checkout session");
  await env.DB.prepare("UPDATE wallet_transactions SET provider_session_id=?, checkout_url=?, provider_response=? WHERE id=?")
    .bind(session.id, checkoutUrl, JSON.stringify(payload).slice(0, 4000), id).run();
  return { id, reference, checkoutUrl, amountPhp };
}
function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function verifyPayMongoSignature(raw: string, header: string | null, secret: string, mode: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map(p => { const i=p.indexOf("="); return i<0?["",""]:[p.slice(0,i).trim(),p.slice(i+1).trim()]; }));
  const timestamp=parts.t, received=mode==="live"?parts.li:parts.te;
  if (!timestamp || !received) return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${timestamp}.${raw}`));
  const expected=Array.from(new Uint8Array(signature)).map(b=>b.toString(16).padStart(2,"0")).join("");
  return constantTimeEqual(expected.toLowerCase(),received.toLowerCase());
}
export async function handlePayMongoWebhook(env: Env, raw: string, signature: string | null): Promise<Response> {
  if (!env.PAYMONGO_WEBHOOK_SECRET) return json({error:"Webhook is not configured"},503);
  if (!(await verifyPayMongoSignature(raw,signature,env.PAYMONGO_WEBHOOK_SECRET,env.PAYMONGO_MODE||"test"))) return json({error:"Invalid webhook signature"},401);
  let event:any; try { event=JSON.parse(raw); } catch { return json({error:"Invalid JSON"},400); }
  const type=event?.data?.attributes?.type || event?.data?.type;
  const session=event?.data?.attributes?.data || event?.data?.data;
  if(type!=="checkout_session.payment.paid") return json({received:true,ignored:true});
  const attrs=session?.attributes||{}, ref=attrs.reference_number, sessionId=session?.id;
  const liveMode=event?.data?.attributes?.livemode;
  if (typeof liveMode === "boolean" && liveMode !== ((env.PAYMONGO_MODE || "test") === "live")) return json({error:"Payment mode mismatch"},400);
  if(!ref&&!sessionId) return json({error:"Missing checkout reference"},400);
  const tx=await env.DB.prepare("SELECT id,tenant_id,amount_php FROM wallet_transactions WHERE provider='paymongo' AND (reference_number=? OR provider_session_id=?) LIMIT 1")
    .bind(ref||"",sessionId||"").first<any>();
  if(!tx) return json({received:true,unmatched:true});
  const paidPayments=Array.isArray(attrs.payments)?attrs.payments.filter((p:any)=>p.status==='paid'):[];
  if(!paidPayments.some((p:any)=>Number(p.amount)===Number(tx.amount_php)*100)) return json({error:'Paid amount does not match wallet transaction'},400);
  const eventId=event?.data?.id||event?.id||`${sessionId||ref}:paid`;
  // Unique ledger reference makes webhook retries idempotent. Wallet balance is derived from ledger entries.
  await env.DB.prepare("INSERT OR IGNORE INTO wallet_ledger (id,tenant_id,amount_php,entry_type,reference,description) VALUES (?,?,?,'topup',?,'PayMongo confirmed wallet top-up')")
    .bind(`paymongo:${tx.id}`,tx.tenant_id,tx.amount_php*100,`paymongo:${tx.id}`).run();
  await env.DB.prepare("UPDATE wallet_transactions SET status='paid',paid_at=COALESCE(paid_at,datetime('now')),provider_event_id=COALESCE(provider_event_id,?) WHERE id=?")
    .bind(eventId,tx.id).run();
  return json({received:true});
}
export const MINIMUM_WALLET_TOPUP_PHP=MIN_TOPUP_PHP;
