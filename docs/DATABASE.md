# Database

Prisma defines the normalized PostgreSQL schema in `apps/api/prisma/schema.prisma`. UUIDs are internal identifiers. Customer-visible tracking uses random tokens stored only as hashes. Repair references are unique per tenant and year.

Money uses PostgreSQL `DECIMAL(12,2)`. Phone identity is unique by `(tenant_id, phone_normalized)`. Useful tenant/branch/status/time indexes support operational queues. Foreign keys cascade only for tenant-owned aggregate deletion; business history is append-only during normal operation.

Run `pnpm db:migrate` and `pnpm db:seed`. Production backups, point-in-time recovery, and connection pooling must be configured at deployment time.
