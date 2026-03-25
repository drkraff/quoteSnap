---
phase: 01-foundation
plan: 02
subsystem: backend-auth
tags: [auth, jwt, bcrypt, express, api]
dependency_graph:
  requires: [01-01]
  provides: [backend-auth-api]
  affects: [01-04, 02-01]
tech_stack:
  added: []
  patterns:
    - JWT 15-min access tokens + 30-day rolling refresh tokens
    - SHA-256 hashed refresh tokens stored in DB (never plaintext)
    - Token rotation on every refresh (old token revoked atomically)
    - bcrypt saltRounds 12 for password hashing
    - Express declaration merging for req.contractor typing
key_files:
  created:
    - apps/backend/src/types/auth.ts
    - apps/backend/src/middleware/auth.ts
    - apps/backend/src/routes/auth.ts
  modified:
    - apps/backend/src/index.ts
decisions:
  - SHA-256 hash stored (not plaintext refresh token) — revocable without storing secret material
  - Token rotation on every refresh — limits refresh token reuse window
  - Logout always returns 200 — prevents token enumeration
  - Same 401 message for wrong password and unknown user — prevents account enumeration
metrics:
  duration: 3m
  completed: 2026-03-25
  tasks_completed: 2
  files_modified: 4
---

# Phase 1 Plan 02: Backend Auth API Summary

**One-liner:** JWT auth API with bcrypt-12 passwords, SHA-256 hashed refresh tokens, and token rotation on refresh via four Express endpoints.

## What Was Built

Complete backend authentication API with four endpoints mounted at `/auth`:

- `POST /auth/register` — validates email+password or phone+password, bcrypt-12 hashes password, creates contractor row, returns 201 with token pair; 409 on duplicate (PG error 23505)
- `POST /auth/login` — validates credentials with constant-time bcrypt.compare, returns 200 with token pair; same 401 message for unknown user and wrong password (no enumeration)
- `POST /auth/refresh` — validates refresh token hash against DB (revoked_at IS NULL, expires_at > NOW()), rotates token (old revoked, new inserted), returns 200 with new pair
- `POST /auth/logout` — hashes token, sets revoked_at, always returns 200 (no info leak)

Plus JWT middleware (`authenticateToken`) for protecting future routes.

## Commits

| Task | Description | Hash |
|------|-------------|------|
| 1 | Auth types and JWT middleware | cb429f3 |
| 2 | Auth route handlers + index.ts update | 30f2526 |

## Files

| File | Purpose |
|------|---------|
| `apps/backend/src/types/auth.ts` | ContractorPayload, RegisterBody, LoginBody, TokenPair, RefreshBody, LogoutBody |
| `apps/backend/src/middleware/auth.ts` | authenticateToken — verifies Bearer JWT, attaches req.contractor |
| `apps/backend/src/routes/auth.ts` | register, login, refresh, logout handlers |
| `apps/backend/src/index.ts` | Mounts authRouter at /auth |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no placeholder data, no hardcoded responses.

## Self-Check: PASSED
