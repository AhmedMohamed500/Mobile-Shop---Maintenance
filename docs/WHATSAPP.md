# WhatsApp

Workflow code writes immutable outbox rows containing message type, tenant, branch, repair, recipient, template variables, status, attempts, and an idempotency key. `WhatsappProvider` is the provider boundary; local development uses a mock provider and does not require Meta credentials.

The production Meta adapter, webhook signature verification, webhook event deduplication, delivery/read receipts, and authorized resend UI remain for the next integration iteration. Intake never waits for the provider.
