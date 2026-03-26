---
phase: 02-onboarding
plan: 01
subsystem: backend
tags: [onboarding, catalog, postgres, express, api]
dependency_graph:
  requires: []
  provides: [catalog_items table, POST /onboarding/seed endpoint, trade templates]
  affects: [apps/backend]
tech_stack:
  added: []
  patterns: [Express Router with authenticateToken middleware, INSERT RETURNING for catalog seeding]
key_files:
  created:
    - apps/backend/src/db/migrations/002_catalog_items.sql
    - apps/backend/src/types/onboarding.ts
    - apps/backend/src/data/trade-templates.ts
    - apps/backend/src/routes/onboarding.ts
  modified:
    - apps/backend/src/index.ts
decisions:
  - Duplicate seeding detected via contractors.trade column — if trade is already set, return 409; no separate seeding_state table needed
  - Sequential INSERT per template item (not bulk) to capture per-row RETURNING id for response payload
metrics:
  duration: "2 minutes"
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_changed: 5
---

# Phase 02 Plan 01: Onboarding Backend Seed API Summary

## One-liner

POST /onboarding/seed endpoint seeds contractor catalog from trade templates (plumbing/electrical/hvac) with 409 duplicate guard and Postgres catalog_items table.

## What Was Built

A complete backend onboarding seed API:

1. **catalog_items migration** — Postgres table with contractor FK (CASCADE delete), server_id UUID, unit_price_cents INTEGER, is_archived flag, partial index for active items, and updated_at trigger reusing the existing `update_updated_at()` function.

2. **Onboarding types** — `SeedBody`, `Trade`, `TradeTemplateItem`, `SeedResponse` in `src/types/onboarding.ts`.

3. **Trade templates** — 10 realistic service items each for plumbing, electrical, and HVAC with integer-cent prices matching the project's pricing architecture.

4. **POST /onboarding/seed** — Authenticated endpoint that:
   - Returns 400 for invalid/missing trade
   - Returns 409 if contractor already has a trade set (duplicate seeding guard)
   - Updates `contractors.trade` column
   - Inserts all template items into `catalog_items`
   - Returns 201 with `{ trade, itemCount, items[] }`

5. **Express wiring** — `onboardingRouter` mounted at `/onboarding` in `index.ts`.

## Verification Results

- Migration `002_catalog_items.sql` applied successfully against Docker quotesnap-db (port 5433)
- TypeScript: zero errors in new files (`migrate.ts` has a pre-existing `import.meta` warning unrelated to this plan)
- All acceptance criteria satisfied

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `apps/backend/src/db/migrations/002_catalog_items.sql` — FOUND
- `apps/backend/src/types/onboarding.ts` — FOUND
- `apps/backend/src/data/trade-templates.ts` — FOUND
- `apps/backend/src/routes/onboarding.ts` — FOUND
- Commit a2ba4ed (Task 1) — FOUND
- Commit d1f5c72 (Task 2) — FOUND
