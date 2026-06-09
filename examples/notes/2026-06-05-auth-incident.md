# Auth incident postmortem

2026-06-05 — Tokens were expiring early due to **clock skew** between services.
Root cause: each service validated expiry against local time, not UTC.

Fix: validate token expiry against UTC everywhere, and refresh server-side.
Follow-up: add a clock-skew alert. Owner: platform team.
