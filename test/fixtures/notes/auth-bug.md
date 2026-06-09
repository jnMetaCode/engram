# Auth bug

2026-06-05 — Found an authentication bug: tokens expired early because of clock
skew between services. The fix is to refresh tokens server-side and validate
expiry against UTC consistently.
