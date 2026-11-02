export interface Env {
  DB: D1Database;
  AI: Ai;
  // DISPATCHER?: DispatchNamespace; // enable when using Workers for Platforms
  SESSION_SECRET: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  AI_GATEWAY_ID: string;
  ENVIRONMENT: string;
}

export interface Tenant {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  credits_balance: number;
}

export interface ApiKeyRecord {
  id: string;
  tenant_id: string;
  key_hash: string;
  key_prefix: string;
  name: string | null;
  scopes: string;
  rate_limit_rpm: number;
  spend_limit: number | null;
  is_active: number;
}

export interface UsageEvent {
  tenantId: string;
  apiKeyId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs?: number;
  status?: string;
  requestId?: string;
}
