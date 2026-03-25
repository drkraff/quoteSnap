---
status: partial
phase: 01-foundation
source: [01-VERIFICATION.md]
started: 2026-03-25T00:00:00Z
updated: 2026-03-25T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end auth flow on device
expected: Register a new contractor, app persists session (survives app kill/reopen), logout clears session, re-login works
result: [pending]

### 2. WatermelonDB cold-start initialization
expected: App initializes WatermelonDB without JSI errors on first launch (both iOS and Android)
result: [pending]

### 3. Session restoration with expired access token
expected: After 15+ min wait, open app — silent token refresh fires before any API call fails, user stays logged in
result: [pending]

### 4. Migration idempotency against live Postgres
expected: Running `npm run migrate` twice against a real Postgres instance succeeds both times, second run skips already-applied migrations
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
