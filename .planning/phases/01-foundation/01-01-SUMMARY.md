---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [expo, react-native, express, postgres, pg, typescript, monorepo, npm-workspaces]

# Dependency graph
requires: []
provides:
  - npm workspaces monorepo with apps/mobile and apps/backend
  - Expo 52 managed React Native app shell with expo-router and strict TypeScript
  - Express server on configurable PORT with GET /health liveness probe
  - pg Pool connected via DATABASE_URL with query helper
  - contractors and refresh_tokens tables with pgcrypto UUIDs
  - email_or_phone CHECK constraint, token_hash indexed, updated_at trigger
  - Idempotent migration runner with _migrations tracking and transaction safety
affects:
  - 01-02
  - 01-03
  - 01-04
  - all subsequent phases

# Tech tracking
tech-stack:
  added:
    - expo ~52.0.0 (managed workflow)
    - expo-router ~4.0.0
    - react-native 0.76.5
    - express ^4.21.2
    - pg ^8.13.1
    - bcrypt ^5.1.1
    - jsonwebtoken ^9.0.2
    - uuid ^11.0.5
    - dotenv ^16.4.5
    - tsx ^4.19.2 (dev)
    - typescript ^5.7.3
  patterns:
    - npm workspaces monorepo (apps/mobile, apps/backend)
    - Express with typed Request/Response, 404 + error middleware
    - pg Pool singleton from DATABASE_URL env var
    - Idempotent SQL migrations with _migrations tracking table, transactional execution
    - .env.example pattern for environment documentation

key-files:
  created:
    - package.json (root workspace config)
    - .gitignore
    - apps/mobile/package.json
    - apps/mobile/app.json (name: QuoteSnap, slug: quotesnap, scheme: quotesnap)
    - apps/mobile/tsconfig.json
    - apps/mobile/.eslintrc.js
    - apps/mobile/app/_layout.tsx
    - apps/mobile/app/index.tsx
    - apps/backend/package.json
    - apps/backend/tsconfig.json (target ES2022, NodeNext modules)
    - apps/backend/src/index.ts
    - apps/backend/.env.example
    - apps/backend/src/db/connection.ts
    - apps/backend/src/db/migrations/001_foundation.sql
    - apps/backend/src/db/migrate.ts
  modified: []

key-decisions:
  - "npm workspaces chosen for monorepo — simple, zero extra tooling, built into npm"
  - "expo-router as main mobile entry point (expo-router/entry in package.json main field)"
  - "tsconfig NodeNext module resolution required for ESM imports with .js extensions in migrate.ts"
  - "Pool error handler calls process.exit(-1) to prevent silent zombie connections"
  - "Migration runner uses file-level isMain detection so it works via tsx direct execution and ts-node"

patterns-established:
  - "Pool singleton: import pool from './db/connection.js' — never create multiple pools"
  - "All env vars accessed via process.env['KEY'] (bracket notation for strict TypeScript)"
  - "Migration SQL files named NNN_description.sql, sorted alphabetically, executed in transaction"
  - "Express handlers typed as (req: Request, res: Response) — no implicit any"

requirements-completed:
  - AUTH-01
  - AUTH-02

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 1 Plan 01: Foundation Summary

**npm workspaces monorepo with Expo 52 mobile shell + Express/Postgres backend, contractors and refresh_tokens tables, and idempotent SQL migration runner**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-25T19:15:16Z
- **Completed:** 2026-03-25T19:17:38Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Root npm workspaces monorepo scaffolded with apps/mobile and apps/backend
- Expo 52 managed app with expo-router, strict TypeScript, placeholder screen
- Express backend with GET /health liveness probe and typed error middleware
- pg Pool singleton with DATABASE_URL guard and query helper
- Foundation SQL migration: contractors + refresh_tokens tables, pgcrypto UUIDs, email_or_phone CHECK, token_hash indexed, updated_at trigger function
- Idempotent migration runner with _migrations tracking, per-migration transaction, skip-if-applied logic

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold monorepo, Expo mobile app, and backend server** - `2d983b8` (feat)
2. **Task 2: Create Postgres foundation migration with auth tables** - `0e59b19` (feat)

## Files Created/Modified

- `package.json` - Root npm workspaces config (apps/mobile, apps/backend)
- `.gitignore` - node_modules, .env, .expo, android/, ios/, dist/
- `apps/mobile/package.json` - Expo 52 managed deps, expo-router entry
- `apps/mobile/app.json` - name: QuoteSnap, slug: quotesnap, scheme: quotesnap
- `apps/mobile/tsconfig.json` - strict: true, extends expo/tsconfig.base
- `apps/mobile/.eslintrc.js` - extends eslint-config-expo
- `apps/mobile/app/_layout.tsx` - Expo Router Stack navigator
- `apps/mobile/app/index.tsx` - Placeholder screen with QuoteSnap title
- `apps/backend/package.json` - Express + pg + bcrypt + jwt + uuid; tsx dev runner
- `apps/backend/tsconfig.json` - ES2022, NodeNext modules, strict, esModuleInterop
- `apps/backend/src/index.ts` - Express server, GET /health, 404 + error middleware
- `apps/backend/.env.example` - PORT, DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
- `apps/backend/src/db/connection.ts` - pg Pool singleton, query helper, process.exit on pool error
- `apps/backend/src/db/migrations/001_foundation.sql` - contractors + refresh_tokens schema
- `apps/backend/src/db/migrate.ts` - Idempotent runner with _migrations table

## Decisions Made

- npm workspaces chosen for monorepo: zero extra tooling, npm-native, adequate for 2-app structure.
- expo-router/entry as main field: required by expo-router v4 for correct bundler entry.
- NodeNext module resolution: required for ESM import paths (.js extension in migrate.ts imports).
- Pool error guard calls `process.exit(-1)`: prevents Node from running with broken DB connection silently.
- Migration isMain detection via `process.argv[1]` filename match: works with tsx, ts-node, and compiled JS.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Before running `npm run migrate`, the user must:

1. Create a local Postgres database: `createdb quotesnap`
2. Copy `.env.example` to `.env` in `apps/backend/`: `cp apps/backend/.env.example apps/backend/.env`
3. Update `DATABASE_URL` in `apps/backend/.env` if not using default postgres credentials
4. Run: `cd apps/backend && npm install && npm run migrate`

No external dashboard configuration required for this plan.

## Known Stubs

- `apps/mobile/app/index.tsx`: Placeholder screen showing static text "QuoteSnap" — intentional MVP shell. The full home screen will be built in Phase 2 (auth UI).
- `apps/mobile/app/_layout.tsx`: Stack navigator wraps placeholder — navigation tree will grow in Phase 2+.

These stubs are intentional and do not prevent the plan's goal (running dev servers + DB schema). They will be resolved in Phase 1 Plans 02–04 and Phase 2.

## Next Phase Readiness

- Monorepo structure is ready for all subsequent plans
- Backend Express server is the base for all API routes (Phase 1 Plans 02–04)
- Database schema foundation is ready — next plan adds catalog and quote tables
- Mobile app shell is ready — next plan wires auth screens

**Blockers:** None. A live Postgres instance is required to run migrations; local setup instructions are in "User Setup Required" above.

---
*Phase: 01-foundation*
*Completed: 2026-03-25*
