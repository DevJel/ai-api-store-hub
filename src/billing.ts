import type { Env, UsageEvent } from './types';

export async function getModelPrice(env: Env, modelId: string) {
  const row = await env.DB.prepare(
    'SELECT input_price_per_m, output_price_per_m FROM model_pricing WHERE model_id = ? AND is_active = 1'
  )
    .bind(modelId)
    .first<{ input_price_per_m: number; output_price_per_m: number }>();

  if (!row) {
    // fallback pricing
    return { input: 1.0, output: 3.0 };
  }
  return { input: row.input_price_per_m, output: row.output_price_per_m };
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  prices: { input: number; output: number }
): number {
  const inputCost = (inputTokens / 1_000_000) * prices.input;
  const outputCost = (outputTokens / 1_000_000) * prices.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal places
}

export async function recordUsage(env: Env, event: UsageEvent): Promise<void> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO usage_logs
     (id, tenant_id, api_key_id, model, input_tokens, output_tokens, cost, latency_ms, status, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      event.tenantId,
      event.apiKeyId ?? null,
      event.model,
      event.inputTokens,
      event.outputTokens,
      event.cost,
      event.latencyMs ?? null,
      event.status ?? 'success',
      event.requestId ?? null
    )
    .run();

  // Deduct credits
  await env.DB.prepare(
    'UPDATE tenants SET credits_balance = credits_balance - ?, updated_at = datetime("now") WHERE id = ?'
  )
    .bind(event.cost, event.tenantId)
    .run();
}

export async function hasSufficientCredits(env: Env, tenantId: string, estimatedCost: number): Promise<boolean> {
  const row = await env.DB.prepare('SELECT credits_balance FROM tenants WHERE id = ?')
    .bind(tenantId)
    .first<{ credits_balance: number }>();
  return (row?.credits_balance ?? 0) >= estimatedCost;
}

export async function addCredits(env: Env, tenantId: string, amount: number): Promise<void> {
  await env.DB.prepare(
    'UPDATE tenants SET credits_balance = credits_balance + ?, updated_at = datetime("now") WHERE id = ?'
  )
    .bind(amount, tenantId)
    .run();
}
