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

## Windows desktop, printers, and live updates

The Tauri shell is in `apps/desktop/src-tauri`. Use `pnpm --filter @repair/desktop tauri:dev` for development and `pnpm --filter @repair/desktop tauri:build` for NSIS/MSI builds. The committed `.env.tauri` points the desktop production build at the HTTPS production API; keep secrets in the backend environment only.

On Windows, the local printer bridge discovers installed printers and prints persisted receipt/label jobs. Configure receipt and label printers per workstation from Settings, including 58/80mm paper, copy count, and automatic printing. Unlock PINs, passwords, and patterns are excluded from printer payloads and the native command whitelist. Failed jobs remain available for retry and do not roll back repair workflow.

Reception, workshop, and delivery screens poll a tenant/branch-scoped durable event cursor and fall back to periodic refresh on connection errors. The connectivity indicator shows whether the API is reachable.

The mock WhatsApp provider remains the default. To use Meta Cloud API, set `WHATSAPP_PROVIDER=meta` and the `META_WHATSAPP_*` backend variables from `.env.example`. Configure Meta to call `GET/POST /api/webhooks/whatsapp`; the backend validates the verify token and SHA-256 signature, stores webhook events idempotently, and tracks sent/delivered/read/failed states.
