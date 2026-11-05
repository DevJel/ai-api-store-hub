-- AI-API Store Hub – D1 Schema

-- Tenants (accounts)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',          -- free | starter | pro | enterprise
  credits_balance REAL NOT NULL DEFAULT 0,    -- prepaid credits (USD)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,                     -- store hash only
  key_prefix TEXT NOT NULL,                   -- e.g. sk-ash-xxxx for display
  name TEXT,
  scopes TEXT DEFAULT 'models:all',           -- JSON or comma-separated
  rate_limit_rpm INTEGER DEFAULT 60,
  spend_limit REAL,                           -- optional hard spend cap
  is_active INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- Usage logs (for billing & analytics)
CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  api_key_id TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,               -- USD charged to tenant
  latency_ms INTEGER,
  status TEXT DEFAULT 'success',
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_date ON usage_logs(tenant_id, created_at);

-- Model pricing (can be overridden per tenant later)
CREATE TABLE IF NOT EXISTS model_pricing (
  model_id TEXT PRIMARY KEY,
  display_name TEXT,
  provider TEXT,                              -- workers-ai | openai | anthropic | ...
  input_price_per_m REAL NOT NULL,            -- USD per 1M input tokens
  output_price_per_m REAL NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- No model is billable until the owner verifies provider costs and enables it.
-- Prices are provider costs in USD per 1M tokens, not customer prices.
INSERT OR IGNORE INTO model_pricing (model_id, display_name, provider, input_price_per_m, output_price_per_m, is_active) VALUES
  ('@cf/meta/llama-3.1-8b-instruct', 'Llama 3.1 8B', 'workers-ai', 0, 0, 0),
  ('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'Llama 3.3 70B', 'workers-ai', 0, 0, 0);

-- GitHub connections (for agent deployment)
CREATE TABLE IF NOT EXISTS github_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  github_user_id TEXT NOT NULL,
  github_login TEXT,
  access_token_encrypted TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
