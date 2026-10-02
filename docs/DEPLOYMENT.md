# Deployment

Run PostgreSQL with encrypted storage and backups. Deploy the API behind TLS and a reverse proxy with request limits and rate limiting. Run database migrations before starting API replicas. Serve the tracking bundle from a separate public origin and restrict API CORS to the desktop/tracking origins.

Required environment variables are documented in `.env.example`. Store secrets in the deployment secret manager. Run outbox workers independently from the web process once the production WhatsApp adapter is enabled.

The Windows desktop build requires Rust, Tauri 2 prerequisites, and a code-signing certificate. Build per environment so the API/tracking URLs are signed into the installer configuration.
