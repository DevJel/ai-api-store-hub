import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, Tenant } from './types';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from './auth';
import { createApiKey, validateApiKey } from './keys';
import { handleChatCompletions } from './gateway';
import { createPayMongoCheckout, handlePayMongoWebhook, MINIMUM_WALLET_TOPUP_PHP } from './paymongo';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health
app.get('/', (c) => c.json({
  name: 'AI-API Store Hub',
  version: '0.1.0',
  status: 'operational',
  docs: 'https://github.com/DevJel/ai-api-store-hub',
}));

app.get('/health', (c) => c.json({ status: 'ok' }));

// ---------- Auth ----------

app.post('/auth/register', async (c) => {
  const body = await c.req.json<{ email: string; password: string; name?: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: 'email and password required' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM tenants WHERE email = ?')
    .bind(body.email.toLowerCase())
    .first();
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
    { id, email: body.email, name: body.name ?? null, plan: 'free', credits_balance: 5 },
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
  if (!body.email || !body.password) {
    return c.json({ error: 'email and password required' }, 400);
  }

  const row = await c.env.DB.prepare(
    'SELECT id, email, password_hash, name, plan, credits_balance FROM tenants WHERE email = ?'
  )
    .bind(body.email.toLowerCase())
    .first<any>();

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

  if (!c.env.SESSION_SECRET || c.env.SESSION_SECRET.length < 32) return c.json({ error: 'Authentication service is not configured' }, 503);\n  const token = await createSessionToken(tenant, c.env.SESSION_SECRET);

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
      'SELECT id, email, name, plan, credits_balance FROM tenants WHERE id = ?'
    )
      .bind(payload.sub)
      .first<any>();
    if (!row) return c.json({ error: 'Tenant not found' }, 401);
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

// ---------- Keys & Billing (session auth) ----------

app.post('/keys', async (c) => {
  const tenantOrErr = await requireSession(c);
  if (tenantOrErr instanceof Response) return tenantOrErr;
  const body = await c.req.json<{ name?: string }>().catch(() => ({}));
  const { raw, record } = await createApiKey(c.env, tenantOrErr.id, body.name);
  return c.json({ apiKey: raw, prefix: record.key_prefix, id: record.id });
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
  return c.json({ currency: 'PHP', balancePhp: balance?.balance_php ?? 0, transactions: transactions.results ?? [] });
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
