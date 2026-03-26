---
phase: 02-onboarding
plan: 02
subsystem: mobile-onboarding
tags: [onboarding, mobile, react-native, watermelondb, offline-first, auth-store]
dependency_graph:
  requires: [02-01]
  provides: [onboarding-screens, offline-templates, catalog-seeding-client]
  affects: [apps/mobile/app/_layout.tsx, apps/mobile/src/store/auth-store.ts]
tech_stack:
  added: []
  patterns:
    - React Native StyleSheet with UI-SPEC tokens
    - Promise.race for 5-second API timeout with offline fallback
    - WatermelonDB database.write() for catalog item insertion
    - SecureStore persistence for onboarding completion flag
key_files:
  created:
    - apps/mobile/src/api/onboarding.ts
    - apps/mobile/src/data/trade-templates.ts
    - apps/mobile/app/(auth)/onboarding/_layout.tsx
    - apps/mobile/app/(auth)/onboarding/trade-selection.tsx
    - apps/mobile/app/(auth)/onboarding/seeding.tsx
    - apps/mobile/app/(auth)/onboarding/ready.tsx
  modified:
    - apps/mobile/src/store/auth-store.ts
    - apps/mobile/app/_layout.tsx
    - apps/mobile/tsconfig.json
decisions:
  - onboardingComplete persisted to SecureStore on setOnboardingComplete(); restored in restoreSession() so returning users skip onboarding on relaunch
  - segments[1] cast to string[] to work around expo-router's tuple type for useSegments() in root layout
  - tsconfig.json gets explicit module esnext to satisfy TypeScript dynamic import constraint when Expo base config provides no module field
metrics:
  duration: 8m
  completed_date: 2026-03-26
  tasks_completed: 2
  tasks_total: 3
  files_created: 6
  files_modified: 3
---

# Phase 2 Plan 02: Onboarding Screens Summary

**One-liner:** Three React Native onboarding screens (trade selection, catalog seeding with 5s timeout/offline fallback, ready confirmation) wired to WatermelonDB and Zustand auth store with SecureStore-persisted onboardingComplete flag.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | API client, offline templates, onboarding store logic | ce5159b | onboarding.ts, trade-templates.ts, auth-store.ts, tsconfig.json |
| 2 | Build 3 onboarding screens and wire navigation | c13dfa4 | _layout.tsx (x2), trade-selection.tsx, seeding.tsx, ready.tsx |
| 3 | Verify onboarding flow end-to-end | auto-approved | (checkpoint — visual verification) |

---

## What Was Built

### Task 1: Foundation Layer

**`apps/mobile/src/api/onboarding.ts`** — Thin API client exporting `seedCatalog(trade)` that POSTs to `/onboarding/seed` via the existing `apiClient`. Exports `Trade` type (`'plumbing' | 'electrical' | 'hvac'`) and `SeedResponse` interface.

**`apps/mobile/src/data/trade-templates.ts`** — Bundled offline fallback with 30 items across 3 trades (10 each), exactly matching the backend templates defined in Plan 01 Task 1. Used when server fetch fails or times out.

**`apps/mobile/src/store/auth-store.ts`** — Added `onboardingComplete: boolean` state, `setOnboardingComplete()` async action (writes `'true'` to SecureStore key `quotesnap_onboarding_complete`), and restored the flag in `restoreSession()`. Login detects returning users via `contractor.trade !== null` and auto-sets `onboardingComplete: true`. Logout and `clearTokens()` both delete the SecureStore key.

### Task 2: Screen Layer

**`(auth)/onboarding/_layout.tsx`** — Stack navigator with `headerShown: false` and `gestureEnabled: false` to prevent back-swipe mid-setup.

**`trade-selection.tsx`** — FlatList 2-column grid of `TradeCard` Pressables. Single-select via `useState<Trade | null>`. Selected card shows `#0066cc` border (2px), `#f5f5f5` background, and Unicode checkmark (top-right, 14px). CTA "Set Up My Catalog" disabled with 50% opacity until a trade is chosen. Navigates to seeding screen with `trade` param.

**`seeding.tsx`** — `useEffect` on mount fires `Promise.race([seedCatalog(trade), 5s timeout])`. On success: writes server items to WatermelonDB with `serverId` set, calls `setOnboardingComplete()`, navigates to ready. On failure/timeout: shows amber notice `#b45309`, loads `OFFLINE_TRADE_TEMPLATES[trade]` into WatermelonDB with `serverId = null`, waits 1s, then advances to ready.

**`ready.tsx`** — Confirmation screen displaying `tradeName` (capitalized) and `itemCount` from route params. "Start Quoting" CTA calls `router.replace('/(app)')`.

**`app/_layout.tsx`** — Auth guard updated to handle 4 routing states: unauthenticated, authenticated + incomplete onboarding, in-auth-group during onboarding, authenticated + complete onboarding.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `module: esnext` to mobile tsconfig**
- **Found during:** Task 1 TypeScript verification
- **Issue:** `expo/tsconfig.base` provides `target: ESNext` but no `module` field — TypeScript defaults to a mode that rejects dynamic `import()` in `client.ts` with TS1323
- **Fix:** Added `"module": "esnext"` to `apps/mobile/tsconfig.json`
- **Files modified:** `apps/mobile/tsconfig.json`
- **Commit:** ce5159b

**2. [Rule 1 - Type Bug] Cast `segments[1]` to `string[]` in root layout**
- **Found during:** Task 2 TypeScript verification
- **Issue:** `useSegments()` return type is `[string]` (1-tuple) — accessing index `[1]` fails TS2493
- **Fix:** Added `(segments as string[])[1]` cast since runtime value has more elements than the static type declares
- **Files modified:** `apps/mobile/app/_layout.tsx`
- **Commit:** c13dfa4

---

## Known Stubs

None. All data flows are wired: `seedCatalog()` calls the real API, `OFFLINE_TRADE_TEMPLATES` provides real data, `database.write()` writes to actual WatermelonDB, `onboardingComplete` persists to SecureStore.

---

## Self-Check: PASSED
