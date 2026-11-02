# AI-API Store Hub

**Multi-tenant AI API marketplace / agent gateway** powered by Cloudflare.

- **Cloudflare AI Gateway** as the unified API agent gateway (OpenAI / Anthropic / Workers AI compatible)
- **Workers for Platforms** for secure multi-tenant isolation
- **D1** for tenants, API keys, usage & billing
- **GitHub** integration for deploying custom agents / MCP servers
- Prepaid credits + usage metering + rate limits

> Your Gateway to Intelligent APIs

## Architecture

```
Client / SDK
    ↓  (Bearer sk-ash-...)
Platform Worker (auth + quota + billing)
    ↓
Cloudflare AI Gateway  ←→  Workers AI / OpenAI / Anthropic / etc.
    ↓
(optional) Tenant User Worker  (Workers for Platforms dispatch)
```

## Features

- Email/password + API key auth
- Per-tenant API keys with scopes & spend limits
- Real-time usage tracking & prepaid wallet
- Model catalog + OpenAI-compatible endpoints
- GitHub OAuth → deploy agent code as isolated Workers
- Dashboard-ready (login UI included in `/frontend`)

## Quick Start

### 1. Prerequisites
- Cloudflare account with Workers Paid (for Workers for Platforms)
- `wrangler` CLI
- Node 18+

### 2. Install

```bash
npm install
npx wrangler login
```

### 3. Create D1 database

```bash
npx wrangler d1 create ai-api-hub
# copy the database_id into wrangler.toml
npx wrangler d1 execute ai-api-hub --file=./src/db/schema.sql
```

### 4. Configure

Edit `wrangler.toml`:
- Set `database_id`
- Optionally set AI Gateway ID / account secrets

### 5. Develop

```bash
npm run dev
```

### 6. Deploy

```bash
npm run deploy
```

## Environment / Secrets

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
# optional Stripe etc.
```

## API Overview

| Endpoint | Description |
|----------|-------------|
| `POST /v1/chat/completions` | OpenAI-compatible (routed via AI Gateway) |
| `POST /v1/messages` | Anthropic-compatible |
| `GET  /v1/models` | Model catalog |
| `POST /auth/login` | Login → JWT + API key |
| `POST /keys` | Create API key |
| `GET  /usage` | Current usage & balance |
| `POST /billing/topup` | Add credits |

All model calls require `Authorization: Bearer sk-ash-...`

## Project Structure

```
.
├── frontend/          # React login + future dashboard
├── src/
│   ├── index.ts        # Main Platform Worker
│   ├── auth.ts
│   ├── billing.ts
│   ├── gateway.ts
│   ├── keys.ts
│   ├── db/
│   │   └── schema.sql
│   └── types.ts
├── wrangler.toml
├── package.json
└── README.md
```

## License

MIT
