# Repair Center ERP

Arabic-first, RTL-first multi-tenant SaaS ERP for mobile repair centers. This repository contains the first usable vertical slice: authentication, tenant/branch isolation, permission-based access, customer/device intake, secure public tracking, reception/workshop views, print jobs, and a WhatsApp outbox.

## Local setup

Requirements: Node.js 22+, pnpm 10+, Docker Desktop, and optionally Rust for the Tauri Windows shell.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open the reception/desktop web UI at `http://localhost:5173`, the tracking UI at `http://localhost:5174/r/<token>`, and the API at `http://localhost:4000`.

Demo tenant: `demo`. Demo password: `Demo@12345`. Users: `owner@demo.local`, `reception@demo.local`, `technician@demo.local`, and `manager@demo.local`.

Generate a valid encryption key before running outside a throwaway environment:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Commands

- `pnpm dev` — API, desktop UI, and tracking UI
- `pnpm test` — automated domain/API tests
- `pnpm typecheck` — TypeScript verification
- `pnpm build` — production frontend/API builds
- `pnpm db:migrate` — PostgreSQL migrations
- `pnpm db:seed` — editable demo tenant and users

The Tauri shell lives in `apps/desktop/src-tauri`; run it after installing the Rust and Tauri prerequisites. Printing remains a local desktop concern, while the API persists print jobs and print history.
