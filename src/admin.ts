import { Hono } from 'hono';
import type { Env } from './types';
import { verifySessionToken } from './auth';

const admin = new Hono<{ Bindings: Env }>();

async function requireAdmin(c: any): Promise<boolean> {
  const header = c.req.header('Authorization') || '';
  if (!header.startsWith('Bearer ') || !c.env.SESSION_SECRET || !c.env.ADMIN_EMAIL) return false;
  try {
    const token = await verifySessionToken(header.slice(7), c.env.SESSION_SECRET);
    const row = await c.env.DB.prepare('SELECT email, account_status FROM tenants WHERE id = ?')
      .bind(token.sub).first();
    return !!row && row.account_status === 'active' && row.email.toLowerCase() === c.env.ADMIN_EMAIL.toLowerCase();
  } catch { return false; }
}

admin.use('/admin-api/*', async (c, next) => {
  if (!(await requireAdmin(c))) return c.json({ error: 'Admin access required' }, 403);
  await next();
});

admin.get('/admin-api/overview', async (c) => {
  const [users, paid, pending, balance, usage, split] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN account_status = \'active\' THEN 1 ELSE 0 END) AS active FROM tenants').first(),
    c.env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(amount_php),0) AS cents FROM wallet_transactions WHERE status='paid'").first(),
    c.env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(amount_php),0) AS php FROM wallet_transactions WHERE status='pending'").first(),
    c.env.DB.prepare('SELECT COALESCE(SUM(amount_php),0) AS cents FROM wallet_ledger').first(),
    c.env.DB.prepare("SELECT COUNT(*) AS requests, COALESCE(SUM(cost),0) AS provider_cost_usd FROM usage_logs WHERE created_at >= datetime('now','-30 days')").first(),
    c.env.DB.prepare("SELECT COALESCE(SUM(platform_share_cents),0) AS platform_cents, COALESCE(SUM(provider_share_cents),0) AS provider_cents, COALESCE(SUM(customer_charge_cents),0) AS charged_cents FROM revenue_allocations WHERE created_at >= datetime('now','-30 days')").first(),
  ]);
  return c.json({ users, payments: { paidCount: paid?.count || 0, paidPhp: Number(paid?.cents || 0), pendingCount: pending?.count || 0, pendingPhp: pending?.php || 0 }, walletLiabilityPhp: Number(balance?.cents || 0) / 100, usage30d: usage, revenueSplit30d: { platformPhp: Number(split?.platform_cents || 0) / 100, providerPhp: Number(split?.provider_cents || 0) / 100, chargedPhp: Number(split?.charged_cents || 0) / 100 } });
});

admin.get('/admin-api/users', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT t.id,t.email,t.name,t.role,t.account_status,t.created_at,
    COALESCE((SELECT SUM(amount_php) FROM wallet_ledger l WHERE l.tenant_id=t.id),0) AS balance_cents,
    (SELECT COUNT(*) FROM api_keys k WHERE k.tenant_id=t.id AND k.is_active=1) AS active_keys
    FROM tenants t ORDER BY t.created_at DESC LIMIT 200`).all();
  return c.json({ data: (rows.results || []).map((r: any) => ({ ...r, balance_php: Number(r.balance_cents || 0) / 100 })) });
});

admin.patch('/admin-api/users/:id/status', async (c) => {
  const body = await c.req.json<{ status: 'active' | 'suspended' }>();
  if (!['active', 'suspended'].includes(body.status)) return c.json({ error: 'Invalid account status' }, 400);
  const id = c.req.param('id');
  const result = await c.env.DB.prepare('UPDATE tenants SET account_status=?, updated_at=datetime(\'now\') WHERE id=?')
    .bind(body.status, id).run();
  if (!(result.meta?.changes || 0)) return c.json({ error: 'User not found' }, 404);
  if (body.status === 'suspended') await c.env.DB.prepare('UPDATE api_keys SET is_active=0 WHERE tenant_id=?').bind(id).run();
  await c.env.DB.prepare('INSERT INTO admin_audit_log (id,admin_email,action,target_id,details) VALUES (?,?,?,?,?)')
    .bind(crypto.randomUUID(), c.env.ADMIN_EMAIL, 'user.status', id, JSON.stringify({ status: body.status })).run();
  return c.json({ updated: true, status: body.status });
});

admin.post('/admin-api/users/:id/adjustment', async (c) => {
  const body = await c.req.json<{ amountPhp: number; reason: string }>();
  if (!Number.isSafeInteger(body.amountPhp) || body.amountPhp === 0 || Math.abs(body.amountPhp) > 1000000 || !body.reason?.trim()) {
    return c.json({ error: 'Provide a non-zero whole-PHP adjustment (max PHP 1,000,000) and reason' }, 400);
  }
  const id = c.req.param('id');
  const user = await c.env.DB.prepare('SELECT id FROM tenants WHERE id=?').bind(id).first();
  if (!user) return c.json({ error: 'User not found' }, 404);
  const cents = body.amountPhp * 100;
  const ref = 'admin-adjustment:' + crypto.randomUUID();
  if (cents < 0) {
    const balance = await c.env.DB.prepare('SELECT COALESCE(SUM(amount_php),0) AS cents FROM wallet_ledger WHERE tenant_id=?').bind(id).first();
    if (Number(balance?.cents || 0) < Math.abs(cents)) return c.json({ error: 'Adjustment would make wallet negative' }, 409);
  }
  await c.env.DB.prepare("INSERT INTO wallet_ledger (id,tenant_id,amount_php,entry_type,reference,description) VALUES (?,?,?,'adjustment',?,?)")
    .bind(crypto.randomUUID(), id, cents, ref, body.reason.trim().slice(0, 300)).run();
  await c.env.DB.prepare('INSERT INTO admin_audit_log (id,admin_email,action,target_id,details) VALUES (?,?,?,?,?)')
    .bind(crypto.randomUUID(), c.env.ADMIN_EMAIL, 'wallet.adjustment', id, JSON.stringify({ amountPhp: body.amountPhp, reason: body.reason.trim() })).run();
  return c.json({ adjusted: true, amountPhp: body.amountPhp });
});

export default admin;
