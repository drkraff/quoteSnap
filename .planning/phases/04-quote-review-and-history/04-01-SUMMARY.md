---
phase: 04-quote-review-and-history
plan: "01"
subsystem: backend-quotes + mobile-utils
tags: [backend, postgres, migration, api, jest, tdd, mobile, pure-functions]
dependency_graph:
  requires: []
  provides:
    - quotes CRUD endpoints (POST, GET list, GET detail, PUT)
    - quote_line_items table (snapshot model, no FK to catalog)
    - mobile line-item mutation helpers
    - mobile send validation
    - mobile API client for quotes
    - Jest test runner (jest-expo)
  affects:
    - apps/mobile/src/screens/quote-review (Plan 02)
    - apps/mobile/src/screens/quote-history (Plan 03)
tech_stack:
  added:
    - jest-expo ~52.0.0 (mobile test runner)
    - "@types/jest ^29.5.0"
  patterns:
    - TDD (RED test → GREEN implementation)
    - Router + authenticateToken + raw SQL + rowToResponse (backend pattern)
    - Pure functions with no side effects for line-item mutations
    - Snapshot model: quote_line_items stores name/price directly (no FK to catalog_items)
key_files:
  created:
    - apps/backend/src/db/migrations/003_quotes.sql
    - apps/backend/src/types/quotes.ts
    - apps/backend/src/routes/quotes.ts
    - apps/mobile/jest.config.js
    - apps/mobile/src/utils/line-items.ts
    - apps/mobile/src/utils/line-items.test.ts
    - apps/mobile/src/utils/quote-validation.ts
    - apps/mobile/src/utils/quote-validation.test.ts
    - apps/mobile/src/utils/format-relative-date.ts
    - apps/mobile/src/api/quotes.ts
  modified:
    - apps/backend/src/index.ts (added quotesRouter mount)
    - apps/mobile/src/theme/tokens.ts (added success color + display typography)
    - apps/mobile/package.json (added test script + jest dev deps)
decisions:
  - "quote_line_items has no FK to catalog_items (snapshot model per D-20) — ensures quotes are immutable after send"
  - "canSend accepts itemCount: number (not array) — cleaner interface for validation without coupling to LineItem type"
  - "format-relative-date uses Intl.RelativeTimeFormat indirectly — returns plain strings without date-fns (not installed)"
  - "PUT /quotes/:id handles lineItems replacement in non-transactional sequential DELETE+INSERT — adequate for MVP scale"
metrics:
  duration: "6m"
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_changed: 13
---

# Phase 4 Plan 01: Backend Quotes Infrastructure + Mobile Utilities Summary

Backend quotes infrastructure with Postgres migration and Express CRUD endpoints. Mobile pure utility functions for line-item mutations, send validation, and relative date formatting — all tested with jest-expo. API client functions wired for sync in Plan 03.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Backend migration, types, routes, server mount | `3250638` | 003_quotes.sql, quotes.ts (types), quotes.ts (routes), index.ts |
| 2 | Token update + Jest setup + utilities + API client | `bc7821a` | tokens.ts, jest.config.js, package.json, line-items.ts, line-items.test.ts, quote-validation.ts, quote-validation.test.ts, format-relative-date.ts, api/quotes.ts |

## Verification Results

- `npx tsc --noEmit` in apps/backend: exits 0 (excluding pre-existing migrate.ts error unrelated to this plan)
- `npx jest` in apps/mobile: 23/23 tests passing (2 test suites)
- Migration 003_quotes.sql applied to local Docker DB (quotesnap-db on 5433)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

- The pre-existing `migrate.ts` TS error (import.meta in NodeNext CJS output) is out of scope — it existed before this plan and the backend uses `tsx` (not `ts-node`) to run migrations via `npm run migrate`.
- `.env` file was copied from main repo to worktree to enable migration execution.

## Known Stubs

None. All utility functions are fully implemented. API client functions make real HTTP calls via `apiClient`. Backend endpoints perform real SQL queries.

## Self-Check: PASSED
