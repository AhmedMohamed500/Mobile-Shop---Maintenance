# Deployment

The production Vercel project builds the desktop web bundle and exposes Fastify through `/api/*`. The same origin serves secure public pages at `/r/<token>` and `/approve/<token>` through SPA rewrites.

Set `PUBLIC_TRACKING_URL=https://mobile-shop-maintenance.vercel.app/r` in production so receipt QR codes and approval messages point to the live site. Keep `VITE_API_URL=/api`. Store `DATABASE_URL`, `JWT_SECRET`, and `UNLOCK_ENCRYPTION_KEY` in Vercel secrets and run `prisma migrate deploy` before publishing code that depends on a migration.

PostgreSQL needs encrypted storage and backups. CORS remains an explicit allowlist for local Vite/Tauri and published origins. Outbox processing is available through the permission-protected API and uses the mock provider by default.

The Windows desktop build requires Rust, Tauri 2 prerequisites, and code signing. The web deployment does not imply that a signed Windows installer or physical printer bridge has been produced.
