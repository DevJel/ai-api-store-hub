-- User access, profile status, and admin audit trail.
ALTER TABLE tenants ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'));
ALTER TABLE tenants ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active','suspended'));
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(account_status);
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at);
