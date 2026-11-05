import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, Tenant } from './types';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from './auth';
import { createApiKey, validateApiKey } from './keys';
import { handleChatCompletions } from './gateway';
import { createPayMongoCheckout, handlePayMongoWebhook, MINIMUM_WALLET_TOPUP_PHP } from './paymongo';
import { walletBalanceCentavos } from './billing';
import { consolePage } from './pages';
import { adminPage } from './admin-page';
import adminRoutes from './admin';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health
app.get('/', (c) => c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17151d"><title>AI API Store Hub — Operava Technologies</title><meta name="description" content="One API gateway for AI models, usage metering and developer integrations. Operated by Operava Technologies."><style>
:root{color-scheme:dark;--bg:#17151d;--panel:#211e29;--line:#393342;--muted:#b8b1c4;--text:#f8f6fb;--purple:#9c7cff;--orange:#ff9a55}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 80% 0%,#33234b 0,transparent 42%),var(--bg);color:var(--text);font:16px/1.6 Inter,ui-sans-serif,system-ui,sans-serif}a{color:#c6b4ff}header,main,footer{max-width:1080px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line)}.brand{font-weight:750;letter-spacing:.02em}.brand span{color:var(--orange)}nav{display:flex;gap:22px;font-size:14px}nav a{text-decoration:none}.hero{padding:90px 24px 65px}.eyebrow{color:var(--orange);font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}.hero h1{font-size:clamp(38px,7vw,68px);line-height:1.04;max-width:820px;margin:18px 0}.hero p{color:var(--muted);font-size:18px;max-width:680px}.actions{display:flex;gap:12px;margin-top:28px;flex-wrap:wrap}.btn{display:inline-block;padding:12px 18px;border-radius:10px;background:linear-gradient(100deg,var(--purple),#7657d6);color:white;text-decoration:none;font-weight:700}.btn.secondary{background:transparent;border:1px solid var(--line)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:30px 0 70px}.card{background:linear-gradient(145deg,#25212e,#1e1b25);border:1px solid var(--line);border-radius:16px;padding:22px}.card h3{margin:0 0 8px}.card p,.muted{color:var(--muted)}section{padding:26px 0 44px}h2{font-size:28px}code{color:#ffc18d;background:#302a37;padding:2px 6px;border-radius:5px}footer{border-top:1px solid var(--line);color:var(--muted);font-size:13px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:25px;padding-bottom:35px}@media(max-width:600px){header{align-items:flex-start;gap:12px;flex-direction:column}.hero{padding-top:58px}nav{gap:16px}}
</style></head><body><header><div class="brand">AI API <span>STORE HUB</span></div><nav><a href="#platform">Platform</a><a href="#developers">Developers</a><a href="/about">About</a><a href="/console">Console</a><a href="https://github.com/DevJel/ai-api-store-hub">GitHub</a></nav></header><main><section class="hero"><div class="eyebrow">Operava Technologies</div><h1>One gateway.<br>More ways to build with AI.</h1><p>A unified developer gateway for AI model access, customer-generated API keys, prepaid usage and clear metering — powered by Cloudflare infrastructure.</p><div class="actions"><a class="btn" href="#developers">Explore the API</a><a class="btn secondary" href="https://github.com/DevJel/ai-api-store-hub">View source</a></div></section><section id="platform"><h2>Built for developers and teams</h2><div class="grid"><article class="card"><h3>Unified AI API</h3><p>OpenAI-compatible chat completions through the Cloudflare Workers AI runtime.</p></article><article class="card"><h3>Own API keys</h3><p>Generate individual <code>sk-ash-</code> keys. Secret values are shown once and stored as hashes.</p></article><article class="card"><h3>Usage wallet</h3><p>Prepaid PHP wallet with metered usage and a minimum top-up of ₱100 through PayMongo.</p></article><article class="card"><h3>Transparent pricing</h3><p>Model prices are activated only after provider costs and exchange rates are verified.</p></article></div></section><section id="developers"><h2>Developer endpoint</h2><p class="muted">Base URL: this deployment's domain. Use your generated API key as a Bearer token.</p><p><code>POST /v1/chat/completions</code> &nbsp; <code>GET /v1/models</code></p><p><code>POST /billing/checkout</code> creates a PayMongo checkout session from an authenticated account. Payment confirmation is handled server-side by a signed webhook — never by the browser redirect.</p></section><section id="about"><h2>About this platform</h2><p class="muted">AI API Store Hub is a technology platform operated by Operava Technologies, providing API infrastructure, automation and developer services. Cloudflare provides the underlying edge runtime and AI services; payment processing is handled by PayMongo.</p></section></main><footer><span>© 2026 Operava Technologies. All Rights Reserved.</span><span>Operate. Automate. Accelerate.</span></footer></body></html>`));
app.get('/about', (c) => c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17151d"><title>AI API Store Hub — Operava Technologies</title><meta name="description" content="One API gateway for AI models, usage metering and developer integrations. Operated by Operava Technologies."><style>
:root{color-scheme:dark;--bg:#17151d;--panel:#211e29;--line:#393342;--muted:#b8b1c4;--text:#f8f6fb;--purple:#9c7cff;--orange:#ff9a55}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 80% 0%,#33234b 0,transparent 42%),var(--bg);color:var(--text);font:16px/1.6 Inter,ui-sans-serif,system-ui,sans-serif}a{color:#c6b4ff}header,main,footer{max-width:1080px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line)}.brand{font-weight:750;letter-spacing:.02em}.brand span{color:var(--orange)}nav{display:flex;gap:22px;font-size:14px}nav a{text-decoration:none}.hero{padding:90px 24px 65px}.eyebrow{color:var(--orange);font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}.hero h1{font-size:clamp(38px,7vw,68px);line-height:1.04;max-width:820px;margin:18px 0}.hero p{color:var(--muted);font-size:18px;max-width:680px}.actions{display:flex;gap:12px;margin-top:28px;flex-wrap:wrap}.btn{display:inline-block;padding:12px 18px;border-radius:10px;background:linear-gradient(100deg,var(--purple),#7657d6);color:white;text-decoration:none;font-weight:700}.btn.secondary{background:transparent;border:1px solid var(--line)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:30px 0 70px}.card{background:linear-gradient(145deg,#25212e,#1e1b25);border:1px solid var(--line);border-radius:16px;padding:22px}.card h3{margin:0 0 8px}.card p,.muted{color:var(--muted)}section{padding:26px 0 44px}h2{font-size:28px}code{color:#ffc18d;background:#302a37;padding:2px 6px;border-radius:5px}footer{border-top:1px solid var(--line);color:var(--muted);font-size:13px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:25px;padding-bottom:35px}@media(max-width:600px){header{align-items:flex-start;gap:12px;flex-direction:column}.hero{padding-top:58px}nav{gap:16px}}
</style></head><body><header><div class="brand">AI API <span>STORE HUB</span></div><nav><a href="#platform">Platform</a><a href="#developers">Developers</a><a href="/about">About</a><a href="https://github.com/DevJel/ai-api-store-hub">GitHub</a></nav></header><main><section class="hero"><div class="eyebrow">Operava Technologies</div><h1>One gateway.<br>More ways to build with AI.</h1><p>A unified developer gateway for AI model access, customer-generated API keys, prepaid usage and clear metering — powered by Cloudflare infrastructure.</p><div class="actions"><a class="btn" href="#developers">Explore the API</a><a class="btn secondary" href="https://github.com/DevJel/ai-api-store-hub">View source</a></div></section><section id="platform"><h2>Built for developers and teams</h2><div class="grid"><article class="card"><h3>Unified AI API</h3><p>OpenAI-compatible chat completions through the Cloudflare Workers AI runtime.</p></article><article class="card"><h3>Own API keys</h3><p>Generate individual <code>sk-ash-</code> keys. Secret values are shown once and stored as hashes.</p></article><article class="card"><h3>Usage wallet</h3><p>Prepaid PHP wallet with metered usage and a minimum top-up of ₱100 through PayMongo.</p></article><article class="card"><h3>Transparent pricing</h3><p>Model prices are activated only after provider costs and exchange rates are verified.</p></article></div></section><section id="developers"><h2>Developer endpoint</h2><p class="muted">Base URL: this deployment's domain. Use your generated API key as a Bearer token.</p><p><code>POST /v1/chat/completions</code> &nbsp; <code>GET /v1/models</code></p><p><code>POST /billing/checkout</code> creates a PayMongo checkout session from an authenticated account. Payment confirmation is handled server-side by a signed webhook — never by the browser redirect.</p></section><section id="about"><h2>About this platform</h2><p class="muted">AI API Store Hub is a technology platform operated by Operava Technologies, providing API infrastructure, automation and developer services. Cloudflare provides the underlying edge runtime and AI services; payment processing is handled by PayMongo.</p></section></main><footer><span>© 2026 Operava Technologies. All Rights Reserved.</span><span>Operate. Automate. Accelerate.</span></footer></body></html>`));

app.get('/console', (c) => c.html(consolePage));
app.get('/admin', (c) => c.html(adminPage));
app.route('/', adminRoutes);
app.get('/billing/success', (c) => c.html('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment submitted</title><body style="font:16px system-ui;background:#17151d;color:#f8f6fb;padding:10vh 8vw"><h1>Payment submitted</h1><p>Your wallet will update after PayMongo confirms the payment. This page does not itself confirm or credit funds.</p><p><a style="color:#c6b4ff" href="/console">Return to developer console</a></p><small>Operava Technologies</small></body></html>'));
app.get('/billing/cancel', (c) => c.html('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Checkout not completed</title><body style="font:16px system-ui;background:#17151d;color:#f8f6fb;padding:10vh 8vw"><h1>Checkout not completed</h1><p>No wallet credit has been added. You can return to the console and try again.</p><p><a style="color:#c6b4ff" href="/console">Return to developer console</a></p><small>Operava Technologies</small></body></html>'));

app.get('/health', (c) => c.json({ status: 'ok' }));

// ---------- Auth ----------

app.post('/auth/register', async (c) => {
  const body = await c.req.json<{ email: string; password: string; name?: string }>();
  if (!body.email || !body.password) return c.json({ error: 'email and password required' }, 400);
  if (body.password.length < 12) return c.json({ error: 'Password must be at least 12 characters' }, 400);
  if (!c.env.SESSION_SECRET || c.env.SESSION_SECRET.length < 32) return c.json({ error: 'Authentication service is not configured' }, 503);

  const existing = await c.env.DB.prepare('SELECT id FROM tenants WHERE email = ?')
    .bind(body.email.toLowerCase())
    .first() as any;
  if (existing) return c.json({ error: 'Email already registered' }, 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);

  await c.env.DB.prepare(
    'INSERT INTO tenants (id, email, password_hash, name, credits_balance) VALUES (?, ?, ?, ?, 0)'
  )
    .bind(id, body.email.toLowerCase(), passwordHash, body.name ?? null)
    .run();

  // Create a default API key
  const { raw, record } = await createApiKey(c.env, id, 'Default');

  const token = await createSessionToken(
    { id, email: body.email, name: body.name ?? null, plan: 'free', credits_balance: 0 },
    c.env.SESSION_SECRET
  );

  return c.json({
    token,
    tenant: { id, email: body.email.toLowerCase(), name: body.name, credits: 0 },
    apiKey: raw, // shown only once
    message: 'Account created. Save your API key – it will not be shown again.',
  });
});

app.post('/auth/login', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  if (!body.email || !body.password) return c.json({ error: 'email and password required' }, 400);
  if (!c.env.SESSION_SECRET || c.env.SESSION_SECRET.length < 32) return c.json({ error: 'Authentication service is not configured' }, 503);

  const row = await c.env.DB.prepare(
    'SELECT id, email, password_hash, name, plan, credits_balance FROM tenants WHERE email = ?'
  )
    .bind(body.email.toLowerCase())
    .first();

  if (!row || !(await verifyPassword(body.password, row.password_hash))) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const tenant: Tenant = {
    id: row.id,
    email: row.email,
    name: row.name,
    plan: row.plan,
    credits_balance: row.credits_balance,
  };

  if (!c.env.SESSION_SECRET || c.env.SESSION_SECRET.length < 32) return c.json({ error: 'Authentication service is not configured' }, 503);
  const token = await createSessionToken(tenant, c.env.SESSION_SECRET);

  return c.json({
    token,
    tenant: {
      id: tenant.id,
      email: tenant.email,
      name: tenant.name,
      plan: tenant.plan,
      credits: tenant.credits_balance,
    },
  });
});

// ---------- Protected helpers ----------

async function requireSession(c: any): Promise<Tenant | Response> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }
  try {
    const payload = await verifySessionToken(
      auth.slice(7),
      c.env.SESSION_SECRET || 'dev-secret-change-me'
    );
    const row = await c.env.DB.prepare(
      'SELECT id, email, name, plan, credits_balance, account_status FROM tenants WHERE id = ?'
    )
      .bind(payload.sub)
      .first() as any;
    if (!row || row.account_status !== 'active') return c.json({ error: 'Account is unavailable' }, 403);
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      plan: row.plan,
      credits_balance: row.credits_balance,
    };
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}

async function requireApiKey(c: any) {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return validateApiKey(c.env, auth.slice(7));
}

// ---------- User profile ----------

app.get('/profile', async (c) => {
  const tenantOrErr = await requireSession(c);
  if (tenantOrErr instanceof Response) return tenantOrErr;
  const row = await c.env.DB.prepare('SELECT id,email,name,plan,created_at FROM tenants WHERE id=?').bind(tenantOrErr.id).first();
  const balance = await walletBalanceCentavos(c.env, tenantOrErr.id);
  return c.json({ profile: row, wallet: { currency: 'PHP', balancePhp: balance / 100, balanceCentavos: balance } });
});

app.patch('/profile', async (c) => {
  const tenantOrErr = await requireSession(c);
  if (tenantOrErr instanceof Response) return tenantOrErr;
  const body: { name?: string } = await c.req.json<{ name?: string }>().catch((): { name?: string } => ({}));
  if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.length > 100) return c.json({ error: 'Name must be 1–100 characters' }, 400);
  await c.env.DB.prepare("UPDATE tenants SET name=?,updated_at=datetime('now') WHERE id=?").bind(body.name.trim(),tenantOrErr.id).run();
  return c.json({ updated: true, name: body.name.trim() });
});

// ---------- Keys & Billing (session auth) ----------

app.post('/keys', async (c) => {
  const tenantOrErr = await requireSession(c);
  if (tenantOrErr instanceof Response) return tenantOrErr;
  const body: { name?: string } = await c.req.json<{ name?: string }>().catch((): { name?: string } => ({}));
  const { raw, record } = await createApiKey(c.env, tenantOrErr.id, body.name);
  return c.json({ apiKey: raw, prefix: record.key_prefix, id: record.id });
});

app.get('/keys', async (c) => {
  const tenantOrErr = await requireSession(c);
  if (tenantOrErr instanceof Response) return tenantOrErr;
  const rows = await c.env.DB.prepare(
    'SELECT id, name, key_prefix, scopes, rate_limit_rpm, is_active, last_used_at, created_at FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenantOrErr.id).all();
  return c.json({ data: rows.results ?? [] });
});

app.delete('/keys/:id', async (c) => {
  const tenantOrErr = await requireSession(c);
  if (tenantOrErr instanceof Response) return tenantOrErr;
  const result = await c.env.DB.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ? AND tenant_id = ?')
    .bind(c.req.param('id'), tenantOrErr.id).run();
  if ((result.meta?.changes || 0) !== 1) return c.json({ error: 'API key not found' }, 404);
  return c.json({ revoked: true });
});

app.get('/usage', async (c) => {
  const tenantOrErr = await requireSession(c);
  if (tenantOrErr instanceof Response) return tenantOrErr;

  const summary = await c.env.DB.prepare(
    `SELECT
       COUNT(*) as requests,
       COALESCE(SUM(input_tokens), 0) as input_tokens,
       COALESCE(SUM(output_tokens), 0) as output_tokens,
       COALESCE(SUM(cost), 0) as total_cost
     FROM usage_logs WHERE tenant_id = ? AND created_at > datetime('now', '-30 days')`
  )
    .bind(tenantOrErr.id)
    .first();

  return c.json({
    credits: tenantOrErr.credits_balance,
    last_30_days: summary,
  });
});

app.post('/billing/checkout', async (c) => {
  const tenantOrErr = await requireSession(c);
  if (tenantOrErr instanceof Response) return tenantOrErr;
  const body = await c.req.json<{ amountPhp: number }>().catch(() => ({ amountPhp: 0 }));
  if (!Number.isSafeInteger(body.amountPhp) || body.amountPhp < MINIMUM_WALLET_TOPUP_PHP) {
    return c.json({ error: 'Minimum wallet top-up is PHP 100' }, 400);
  }
  try {
    const checkout = await createPayMongoCheckout(c.env, tenantOrErr.id, tenantOrErr.email, body.amountPhp, new URL(c.req.url).origin);
    return c.json({ checkoutUrl: checkout.checkoutUrl, reference: checkout.reference, amountPhp: checkout.amountPhp });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Checkout creation failed' }, 502);
  }
});

app.get('/billing/wallet', async (c) => {
  const tenantOrErr = await requireSession(c);
  if (tenantOrErr instanceof Response) return tenantOrErr;
  const balance = await c.env.DB.prepare('SELECT COALESCE(SUM(amount_php), 0) AS balance_php FROM wallet_ledger WHERE tenant_id = ?')
    .bind(tenantOrErr.id).first<{ balance_php: number }>();
  const transactions = await c.env.DB.prepare(
    "SELECT id, reference_number, amount_php, status, created_at, paid_at FROM wallet_transactions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 25"
  ).bind(tenantOrErr.id).all();
  return c.json({ currency: 'PHP', balancePhp: Number(balance?.balance_php ?? 0) / 100, balanceCentavos: Number(balance?.balance_php ?? 0), transactions: transactions.results ?? [] });
});

app.post('/webhooks/paymongo', async (c) => {
  const raw = await c.req.text();
  return handlePayMongoWebhook(c.env, raw, c.req.header('Paymongo-Signature') ?? null);
});

// ---------- Public Model API (API key auth) ----------

app.get('/v1/models', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT model_id as id, display_name as name, provider FROM model_pricing WHERE is_active = 1'
  ).all();

  return c.json({
    object: 'list',
    data: (rows.results || []).map((m: any) => ({
      id: m.id,
      object: 'model',
      owned_by: m.provider,
      name: m.name,
    })),
  });
});

app.post('/v1/chat/completions', async (c) => {
  const auth = await requireApiKey(c);
  if (!auth) return c.json({ error: { message: 'Invalid API key', type: 'authentication_error' } }, 401);
  const recent = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM usage_logs WHERE api_key_id = ? AND created_at > datetime('now', '-1 minute')"
  ).bind(auth.key.id).first<{ count: number }>();
  if (Number(recent?.count || 0) >= auth.key.rate_limit_rpm) {
    return c.json({ error: { message: 'API key rate limit exceeded', type: 'rate_limit_error' } }, 429);
  }
  const body = await c.req.json();
  return handleChatCompletions(c.env, body, auth.tenant.id, auth.key.id);
});

// Catch-all
app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
