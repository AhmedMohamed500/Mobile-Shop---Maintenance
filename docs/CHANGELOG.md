# Changelog

## 0.2.0 — 2026-10-03

- Completed the connected reception → workshop → customer approval → repair → ready → delivery workflow.
- Added customer history, normalized phone lookup, versioned quotations/decisions, diagnostic notes, technician assignments, exact delivery payments, credential purge, and admin status correction.
- Added reception search/QR lookup, ready lists, delivery UI, public tracking/approval, tenant settings, branches, editable/reorderable catalogs, users, roles/permissions, subscription view, audit list, and WhatsApp outbox processing.
- Added configurable 58/80 mm receipt payloads and safe label/reprint jobs.
- Added repeatable demo users/repairs and migrations for workflow and tenant operational settings.
- Added API tests for authentication, permissions, tenant isolation, idempotent intake/approval, ready visibility, payment/delivery, and unlock purge.

## 0.1.0 — 2026-10-02

- Initialized the multi-tenant monorepo and PostgreSQL domain schema.
- Added authentication, permission templates, tenant/branch scoping, demo seed data, secure intake primitives, and Arabic RTL shells.
