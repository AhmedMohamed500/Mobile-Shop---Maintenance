# Permissions

Roles are tenant-owned templates. Effective access is the union of permission rows assigned through a user's roles. The API enforces permissions independently of UI navigation.

The seed creates owner, manager, receptionist, and technician templates from the canonical permission list in `packages/domain/src/index.ts`. Tenant admins may later edit role assignments without changing source code. Sensitive unlock reveal requires `repair.unlock.view` and creates an audit event each time.
