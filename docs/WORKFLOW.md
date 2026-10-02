# Repair workflow

Transitions are centralized in `packages/domain/src/index.ts`. Arbitrary status writes are forbidden.

`RECEIVED → DIAGNOSING → AWAITING_CUSTOMER_APPROVAL → CUSTOMER_APPROVED → UNDER_REPAIR → READY_FOR_DELIVERY → DELIVERED`

A rejected quote moves to `CUSTOMER_DECLINED → READY_FOR_RETURN_WITHOUT_REPAIR → DELIVERED`. Cancellation and controlled return transitions are explicit. Every transition appends status history and audit metadata. Delivery purges the encrypted unlock credential in the same transaction.

The first slice exposes intake and the workshop queue. Versioned quotations, signed customer decisions, delivery collection, and admin correction UI belong to the next slice and already have reserved workflow states.
