---
phase: 01-foundation
plan: 04
subsystem: mobile-auth
tags: [zustand, expo-secure-store, expo-router, auth-store, api-client, navigation]
dependency_graph:
  requires: [01-02, 01-03]
  provides: [mobile-auth-flow, session-management, auth-navigation]
  affects: [all-mobile-plans]
tech_stack:
  added:
    - "zustand ^5.0.0 — state management for auth store"
    - "expo-secure-store ~14.0.0 — encrypted token storage on device"
  patterns:
    - "Zustand store with SecureStore persistence for auth tokens"
    - "Lazy dynamic import in apiClient to break circular dependency with auth-store"
    - "401 auto-refresh: retry once after refreshSession(), logout on second 401"
    - "Expo Router segment-based auth guard in root _layout.tsx"
    - "restoreSession: reads all 3 SecureStore keys, falls back to refresh if access token missing"
key_files:
  created:
    - apps/mobile/src/api/client.ts
    - apps/mobile/src/api/auth.ts
    - apps/mobile/src/store/auth-store.ts
    - apps/mobile/app/(auth)/_layout.tsx
    - apps/mobile/app/(auth)/login.tsx
    - apps/mobile/app/(auth)/register.tsx
    - apps/mobile/app/(app)/_layout.tsx
    - apps/mobile/app/(app)/index.tsx
  modified:
    - apps/mobile/app/_layout.tsx
    - apps/mobile/package.json
decisions:
  - "Lazy dynamic import for auth-store in apiClient: avoids circular dependency at module initialization time"
  - "restoreSession sets tokens immediately from SecureStore even if access token may be expired: first API call will auto-refresh"
  - "logout best-effort: server revocation attempted but local session cleared regardless of network failure"
  - "Register/login screens use store.login()/store.register() (not destructured): matches plan acceptance criteria"
metrics:
  duration: "15 minutes"
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_created: 10
---

# Phase 01 Plan 04: Mobile Auth Flow Summary

Zustand auth store with SecureStore token persistence, fetch-based API client with 401 auto-refresh, register/login/logout screens, and segment-based session detection in Expo Router root layout — completing the full mobile authentication layer on top of the backend auth API and WatermelonDB foundation.

## Tasks Completed

### Task 1: Create auth store, API client, and auth API functions
**Commit:** 48c33a0

Three files wired together:

**`src/api/client.ts`** — `apiClient` wraps `fetch` with:
- `Authorization: Bearer {accessToken}` header from `useAuthStore.getState().accessToken`
- On 401: calls `refreshSession()`, retries once if successful, calls `logout()` and throws if not
- Typed error `{ status: number; error: string }` on non-2xx
- Lazy dynamic import of `useAuthStore` to prevent circular dependency at module load

**`src/api/auth.ts`** — Four typed functions: `register`, `login`, `refresh`, `logout` mapping to `POST /auth/{register,login,refresh,logout}`.

**`src/store/auth-store.ts`** — Zustand store with:
- State: `contractor`, `accessToken`, `refreshToken`, `isLoading`, `isAuthenticated`
- `login`/`register`: call API, store all 3 SecureStore keys (`quotesnap_access_token`, `quotesnap_refresh_token`, `quotesnap_contractor`), set state
- `logout`: best-effort server revocation, always deletes all 3 SecureStore keys
- `refreshSession`: reads refresh token from state, calls `authApi.refresh`, updates both SecureStore keys and state. Returns `true/false`
- `restoreSession`: reads all 3 keys from SecureStore; if present, sets state immediately (access token may be stale — first API call will auto-refresh). If refresh token missing, sets `isLoading: false` with null state

### Task 2: Build auth screens and session-gated navigation
**Commit:** 8869b78

**`app/_layout.tsx`** (ROOT LAYOUT, replaced scaffold version):
- `useEffect` on mount: calls `initNetworkMonitor()`, `initSyncQueue()` (returns unsubscriber), `restoreSession()`
- Auth-guard `useEffect` watches `[isLoading, contractor, accessToken, segments]`
- Shows `ActivityIndicator` while `isLoading` is true
- Renders `<Slot />` once loaded

**`app/(auth)/_layout.tsx`**: Stack navigator, `headerShown: false`

**`app/(auth)/login.tsx`**: Email + password TextInputs, "Log In" Button, error display in red, Link to register. Calls `store.login()`.

**`app/(auth)/register.tsx`**: Optional display name + email + password (min 8 chars client-side), "Create Account" Button, Link to login. Calls `store.register()`.

**`app/(app)/_layout.tsx`**: Stack navigator, `headerTitle: "QuoteSnap"`

**`app/(app)/index.tsx`**: Placeholder home — "Welcome, {name}!", "QuoteSnap is ready.", "Log Out" button

### Task 3: checkpoint:human-verify
**Status:** Auto-approved (auto_advance=true)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cherry-picked foundation code from parallel worktree branches**
- **Found during:** Pre-task setup
- **Issue:** This worktree (`worktree-agent-a6cb3d61`) was at `353b472` (plan 02 docs only) without the actual code from plans 01, 02, 03 which were committed to separate worktree branches
- **Fix:** Cherry-picked `2d983b8`, `0e59b19` (plan 01 code), `cb429f3`, `30f2526` (plan 02 code), `ff663fc`, `941e78f` (plan 03 code). Resolved `apps/mobile/package.json` and `tsconfig.json` conflicts by keeping plan 03 versions (most up-to-date with WatermelonDB)
- **Files modified:** All foundation files cherry-picked cleanly

**2. [Rule 1 - Bug] Lazy import in apiClient to prevent circular dependency**
- **Found during:** Task 1 implementation
- **Issue:** `apiClient` imports `useAuthStore` and `useAuthStore` imports `apiClient` (via authApi), creating a circular module dependency at initialization time
- **Fix:** Used `await import('../store/auth-store')` (lazy dynamic import) inside the request function instead of a top-level static import — resolves the module when first needed, after both modules are initialized
- **Files modified:** `src/api/client.ts`

## Known Stubs

- `app/(app)/index.tsx` — placeholder home screen. Real app screens (catalog, voice recording, quote history) come in Phases 3–5. The Welcome message reads from `contractor.displayName ?? contractor.email` — not hardcoded, real data.
- `src/sync/sync-queue.ts` (from Plan 03) — `pushToServer()` call is commented out; actual server push deferred to Phase 7. Queue infrastructure is complete.

## Self-Check: PASSED
