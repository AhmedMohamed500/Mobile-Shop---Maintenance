# Repair workflow

Transitions are centralized in `packages/domain/src/index.ts`; ordinary users cannot write arbitrary states.

`RECEIVED → DIAGNOSING → AWAITING_CUSTOMER_APPROVAL → CUSTOMER_APPROVED → UNDER_REPAIR → READY_FOR_DELIVERY → DELIVERED`

A rejected quotation moves through `CUSTOMER_DECLINED → READY_FOR_RETURN_WITHOUT_REPAIR → DELIVERED`. Cancellation and controlled return transitions are explicit.

Workshop users can add diagnostic/internal notes, assign technicians, create versioned quotations, and reveal encrypted unlock data when permitted. Each reveal is audited. Public decisions use hashed random tokens and are idempotent. Repricing supersedes a pending quotation and always creates a new version.

Ready orders are read directly from repair status on the reception dashboard. Delivery validates eligibility, calculates the approved charge minus valid payments, records collection and employee/time, creates the final print/message/audit jobs, appends history, and purges unlock credentials in one transaction.

Authorized admins may correct a status with a required reason. Correction appends history and audit entries; it never deletes the original record.
