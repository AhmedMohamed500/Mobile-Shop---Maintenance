# WhatsApp

Workflow transactions write outbox rows with message type, tenant, branch, repair, recipient, template variables, status, attempt count, and a unique idempotency key. Intake and workflow state changes never wait for the provider.

`WhatsappProvider` is the provider boundary. `MockWhatsappProvider` processes queued/failed rows through the permission-protected `/whatsapp/process` endpoint and records provider IDs, attempts, sent time, or failure reason. The settings UI shows queue totals and can trigger processing.

Messages cover received, awaiting approval, customer decision, under repair, ready for delivery with balance, and delivered. The production Meta adapter, webhook validation, and delivery/read receipts remain external provider integration work.
