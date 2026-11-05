import type { Env, UsageEvent } from './types';

export function getUsdPhpRate(env: Env): number {
  const rate = Number(env.USD_PHP_RATE);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('USD_PHP_RATE must be configured with a verified PHP-per-USD rate');
  return rate;
}
export async function getModelPrice(env: Env, modelId: string) {
  const row = await env.DB.prepare('SELECT input_price_per_m, output_price_per_m FROM model_pricing WHERE model_id = ? AND is_active = 1')
    .bind(modelId).first<{input_price_per_m:number;output_price_per_m:number}>();
  if (!row || row.input_price_per_m <= 0 || row.output_price_per_m <= 0) throw new Error('Model is not enabled or has no verified provider cost');
  return { input: row.input_price_per_m, output: row.output_price_per_m };
}
export function calculateCost(inputTokens:number, outputTokens:number, prices:{input:number;output:number}) {
  return Math.round(((inputTokens/1_000_000)*prices.input+(outputTokens/1_000_000)*prices.output)*1_000_000)/1_000_000;
}
// A 30% gross margin means customer price = provider cost / (1 - 0.30), not cost * 1.30.
export function customerChargeCentavos(costUsd:number, usdPhpRate:number) {
  return Math.ceil((costUsd * usdPhpRate / 0.70) * 100);
}
export async function walletBalanceCentavos(env:Env,tenantId:string) {
  const row=await env.DB.prepare('SELECT COALESCE(SUM(amount_php),0) AS balance FROM wallet_ledger WHERE tenant_id=?').bind(tenantId).first<{balance:number}>();
  return Number(row?.balance||0);
}
export async function reserveWallet(env:Env,tenantId:string,requestId:string,amountCentavos:number):Promise<boolean> {
  if (!Number.isSafeInteger(amountCentavos) || amountCentavos < 0) return false;
  if (amountCentavos === 0) return true;
  const result=await env.DB.prepare(`INSERT INTO wallet_ledger (id,tenant_id,amount_php,entry_type,reference,description)
    SELECT ?,?,-?,'usage',?,'Reserved for model request'
    WHERE (SELECT COALESCE(SUM(amount_php),0) FROM wallet_ledger WHERE tenant_id=?) >= ?`)
    .bind(`reserve:${requestId}`,tenantId,amountCentavos,`usage-reserve:${requestId}`,tenantId,amountCentavos).run();
  return (result.meta?.changes||0)===1;
}
export async function settleWalletReservation(env:Env,tenantId:string,requestId:string,reserved:number,actual:number) {
  const difference=reserved-actual;
  if (difference>0) {
    await env.DB.prepare(`INSERT OR IGNORE INTO wallet_ledger (id,tenant_id,amount_php,entry_type,reference,description) VALUES (?,?,?,'adjustment',?,'Unused request reservation returned')`)
      .bind(`settle:${requestId}`,tenantId,difference,`usage-settlement:${requestId}`).run();
  }
}
export async function refundWalletReservation(env:Env,tenantId:string,requestId:string,reserved:number) {
  if (reserved<=0) return;
  await env.DB.prepare(`INSERT OR IGNORE INTO wallet_ledger (id,tenant_id,amount_php,entry_type,reference,description) VALUES (?,?,?,'refund',?,'Failed model request reservation refunded')`)
    .bind(`refund:${requestId}`,tenantId,reserved,`usage-refund:${requestId}`).run();
}
export async function recordUsage(env:Env,event:UsageEvent) {
  await env.DB.prepare(`INSERT INTO usage_logs (id,tenant_id,api_key_id,model,input_tokens,output_tokens,cost,latency_ms,status,request_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),event.tenantId,event.apiKeyId??null,event.model,event.inputTokens,event.outputTokens,event.cost,event.latencyMs??null,event.status??'success',event.requestId??null).run();
}
