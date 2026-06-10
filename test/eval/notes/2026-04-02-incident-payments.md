# Payments outage postmortem

2026-04-02 — Stripe webhooks were dropped for 3 hours because our endpoint
returned 500s on duplicate events. Root cause: a unique constraint violation
we treated as fatal. Fix shipped: idempotent webhook handling, dead-letter
queue for replays. Customer impact: 12 failed checkouts, all recovered.
