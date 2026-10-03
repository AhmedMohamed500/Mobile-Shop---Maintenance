# Repair Center ERP

Arabic-first, RTL-first multi-tenant SaaS ERP for mobile repair centers. The current vertical slice is operational from reception through workshop, customer approval, repair, delivery, payment, tracking, messages, printing queues, and audit history.

## Implemented workflow

`RECEIVED → DIAGNOSING → AWAITING_CUSTOMER_APPROVAL → CUSTOMER_APPROVED → UNDER_REPAIR → READY_FOR_DELIVERY → DELIVERED`

A rejected quotation follows `CUSTOMER_DECLINED → READY_FOR_RETURN_WITHOUT_REPAIR → DELIVERED`. Quotations are versioned; changing a price creates a new approval request. Delivery collects the exact valid balance and purges encrypted unlock credentials.

The desktop/web app includes permission-aware reception, intake, delivery, customers, workshop, settings, users, roles, public tracking, and public quote approval. Reception sees only reception modules. Counts and lists come from PostgreSQL.

## Local setup

Requirements: Node.js 22+, pnpm 11+, PostgreSQL, and optionally Rust for the Tauri Windows shell.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open the app at `http://localhost:5173`, the standalone tracking UI at `http://localhost:5174/r/<token>`, and the API at `http://localhost:4000`. Production also serves `/r/<token>` and `/approve/<token>` from the main web app.

## Demo data

- Center code: `demo`
- Branch: `MAIN`
- Password for all demo users: `Demo@12345`
- Owner: `owner@demo.local`
- Manager: `manager@demo.local`
- Reception: `reception@demo.local`
- Technician: `technician@demo.local`

Seed is repeatable and restores the documented demo users, editable brands/fault presets, subscription, and clearly prefixed `DEMO-...` repair orders.

## Commands

- `pnpm dev` — API, desktop UI, and standalone tracking UI
- `pnpm test` — domain, API, and frontend client tests
- `pnpm typecheck` — TypeScript verification
- `pnpm build` — production builds
- `pnpm db:migrate` — PostgreSQL migrations
- `pnpm db:seed` — deterministic demo data

Generate a valid unlock encryption key outside throwaway environments:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

The Tauri shell is in `apps/desktop/src-tauri`. Print jobs and safe receipt/label payloads are persisted and reprintable. A physical printer still requires the local Tauri printer bridge. The mock WhatsApp provider can process the outbox without Meta credentials; production Meta credentials/webhooks are a separate provider integration.
