-- Immutable 30/70 settlement allocation for every successful metered request.
CREATE TABLE IF NOT EXISTS revenue_allocations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider_code TEXT NOT NULL,
  customer_charge_cents INTEGER NOT NULL CHECK(customer_charge_cents >= 0),
  platform_share_cents INTEGER NOT NULL CHECK(platform_share_cents >= 0),
  provider_share_cents INTEGER NOT NULL CHECK(provider_share_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(platform_share_cents + provider_share_cents = customer_charge_cents)
);
CREATE INDEX IF NOT EXISTS idx_revenue_allocations_created ON revenue_allocations(created_at);
CREATE INDEX IF NOT EXISTS idx_revenue_allocations_provider ON revenue_allocations(provider_code,created_at);
