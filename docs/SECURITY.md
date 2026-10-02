# Security

Employee passwords use bcrypt with cost 12. JWTs expire after eight hours and include only tenant, branch, and effective permissions. Production must rotate a random 32+ character signing secret.

Unlock data uses AES-256-GCM with a base64 32-byte environment key. Plaintext is never logged, displayed by default, or included in public/print/message payloads. Reveal requires a dedicated permission and audit entry; delivery clears every encrypted component.

Tracking tokens contain 256 random bits and are stored as SHA-256 hashes. Tenant-scoped uniqueness and query filters mitigate IDOR. Add edge rate limiting for public endpoints in deployment. File attachment endpoints are intentionally absent until MIME inspection, object isolation, and malware scanning are implemented.
