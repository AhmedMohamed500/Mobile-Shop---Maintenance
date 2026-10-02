# Architecture

The monorepo separates the central API (`apps/api`), Windows desktop UI (`apps/desktop`), public tracking UI (`apps/tracking`), and framework-independent business rules (`packages/domain`). PostgreSQL is authoritative. React never talks to printers or WhatsApp directly.

The API derives `tenantId`, `branchId`, and permissions from the signed employee token. It never accepts tenant identity from request bodies. All operational reads and writes include the authenticated tenant scope. Public tracking resolves a SHA-256 hash of a 256-bit random token and selects only customer-safe fields.

Device intake is one database transaction. It creates or updates the customer, allocates the repair reference under a PostgreSQL advisory lock, records initial status/deposit/audit data, and queues receipt, label, and WhatsApp outbox rows. An idempotency key prevents double-click and reconnect duplicates. Printing or message delivery happens later and cannot roll back an accepted repair.

The desktop currently uses the web development shell and includes a Tauri 2 configuration. A local printer bridge and SQLite-backed connection outbox are the next desktop-specific integration step.
