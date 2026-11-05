-- PayMongo wallet ledger. Balance is derived from immutable ledger rows.
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  reference_number TEXT NOT NULL UNIQUE,
  provider_session_id TEXT UNIQUE,
  provider_event_id TEXT,
  checkout_url TEXT,
  amount_php INTEGER NOT NULL CHECK(amount_php >= 100),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','expired','refunded')),
  provider_response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tenant ON wallet_transactions(tenant_id,created_at);
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount_php INTEGER NOT NULL,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('topup','usage','refund','adjustment')),
  reference TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_tenant ON wallet_ledger(tenant_id,created_at);
