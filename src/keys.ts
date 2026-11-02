import type { Env, ApiKeyRecord, Tenant } from './types';
import { generateApiKey, hashApiKey } from './auth';

export async function createApiKey(
  env: Env,
  tenantId: string,
  name?: string
): Promise<{ raw: string; record: ApiKeyRecord }> {
  const { raw, prefix } = generateApiKey();
  const keyHash = await hashApiKey(raw);
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO api_keys (id, tenant_id, key_hash, key_prefix, name)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, tenantId, keyHash, prefix, name ?? 'Default')
    .run();

  const record: ApiKeyRecord = {
    id,
    tenant_id: tenantId,
    key_hash: keyHash,
    key_prefix: prefix,
    name: name ?? 'Default',
    scopes: 'models:all',
    rate_limit_rpm: 60,
    spend_limit: null,
    is_active: 1,
  };

  return { raw, record };
}

export async function validateApiKey(
  env: Env,
  rawKey: string
): Promise<{ tenant: Tenant; key: ApiKeyRecord } | null> {
  if (!rawKey.startsWith('sk-ash-')) return null;

  const keyHash = await hashApiKey(rawKey);

  const row = await env.DB.prepare(
    `SELECT k.*, t.id as tid, t.email, t.name as tname, t.plan, t.credits_balance
     FROM api_keys k
     JOIN tenants t ON t.id = k.tenant_id
     WHERE k.key_hash = ? AND k.is_active = 1`
  )
    .bind(keyHash)
    .first<any>();

  if (!row) return null;

  // update last_used
  await env.DB.prepare('UPDATE api_keys SET last_used_at = datetime("now") WHERE id = ?')
    .bind(row.id)
    .run();

  return {
    tenant: {
      id: row.tid,
      email: row.email,
      name: row.tname,
      plan: row.plan,
      credits_balance: row.credits_balance,
    },
    key: {
      id: row.id,
      tenant_id: row.tid,
      key_hash: row.key_hash,
      key_prefix: row.key_prefix,
      name: row.name,
      scopes: row.scopes,
      rate_limit_rpm: row.rate_limit_rpm,
      spend_limit: row.spend_limit,
      is_active: row.is_active,
    },
  };
}
