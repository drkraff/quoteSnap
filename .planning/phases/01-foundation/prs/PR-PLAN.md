# Phase 1 — Code Review PR Plan

Source: Code review conducted 2026-04-10 against Phase 1 foundation files.
Branch base: `master`

---

## PR 1 — Backend Hardening
**Branch:** `fix/p1-backend-hardening`
**Risk:** Low — no mobile touch, purely defensive changes

### Changes
- `apps/backend/src/index.ts` or `apps/backend/src/routes/auth.ts` — add `express-rate-limit` on `/auth/login` and `/auth/refresh`
- `apps/backend/src/db/connection.ts` — remove `process.exit(-1)` from `pool.on('error')`; replace with a log statement

### Why
- Rate limiting: `/auth/login` is wide open to brute-force. bcrypt at SALT_ROUNDS=12 throttles per-attempt but parallel attacks against multiple accounts are unhindered.
- Pool exit: any transient Postgres network hiccup kills the entire Node process, dropping all in-flight requests with no graceful shutdown.

### Verification
- `cd apps/backend && npm run build` — must pass
- Start backend, hit `/auth/login` 7+ times rapidly — should get 429 after limit
- Kill and restart Postgres while backend is running — process should survive, requests should 500 not crash

---

## PR 2 — Token Refresh Race Condition
**Branch:** `fix/p1-refresh-race`
**Risk:** Low-Medium — additive change, doesn't affect happy path

### Changes
- `apps/mobile/src/api/client.ts` — add module-level `refreshPromise` guard so concurrent 401s share one refresh attempt instead of each calling `refreshSession()` independently

### Why
Any screen that fires two API calls on mount will trigger this after a token expiry. The first refresh wins; the rest get 401 from the refresh endpoint and land in the `logout()` branch. Users get silently logged out during normal usage.

### Fix
```ts
let refreshPromise: Promise<boolean> | null = null;

async function getOrRefreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = useAuthStore.getState().refreshSession().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}
```
Replace the direct `refreshSession()` call in the 401 handler with `getOrRefreshSession()`.

### Verification
- `cd apps/mobile && npx expo export --platform android` — must pass
- Manual: let access token expire (or shorten JWT expiry temporarily), navigate to a screen that fires 2+ API calls on mount — session should persist, not log out

---

## PR 3 — Sync Queue Correctness
**Branch:** `fix/p1-sync-queue`
**Risk:** Low-Medium — sync is still a stub (Phase 7), so retry logic impact is limited now

### Changes
- `apps/mobile/src/sync/sync-queue.ts` — add `processing` boolean lock to `processQueue` to prevent concurrent runs
- `apps/mobile/src/sync/sync-queue.ts` — guard against null `serverId` on audio upload item: throw instead of passing `''`
- `apps/mobile/src/sync/network-monitor.ts` — store and return `NetInfo.addEventListener` unsubscribe, call it on cleanup

### Why
- No lock: two concurrent `processQueue` calls fetch the same pending items and push them both to the server, creating duplicate quotes/catalog items.
- Null `serverId`: audio sync fires with an empty string quote ID if the parent quote hasn't synced yet, creating an orphaned server record.
- Listener leak: `initNetworkMonitor` discards the `addEventListener` unsubscribe, leaking listeners on dev Fast Refresh.

### Hold
The `failed` → `pending` retry status fix is deferred to Phase 7 — the sync push is still a stub, so retries don't actually do anything meaningful yet. Revisit when `pushToServer` is implemented.

### Verification
- `cd apps/mobile && npx expo export --platform android` — must pass
- Review that `processing = false` is reset in a `finally` block

---

## PR 4 — Login OR Query Fix
**Branch:** `fix/p1-login-query`
**Risk:** Medium — changes auth behavior, test login/register manually after merge

### Changes
- `apps/backend/src/routes/auth.ts` — split the login lookup into separate code paths: if `email` provided, query by email only; if `phone` provided, query by phone only; never mix in one OR query with `LIMIT 1`

### Why
The current query uses `WHERE (email = $1) OR (phone = $2)` with `LIMIT 1`. If both fields are provided and match different contractors, the wrong account is returned. An attacker who knows a victim's phone could submit their own email + victim's phone and potentially match the victim's row (though they still need the password).

### Verification
- `cd apps/backend && npm run build` — must pass
- Manual: register two accounts (one with email, one with phone), log in with each — both should work
- Manual: attempt login with mismatched email+phone — should fail cleanly

---

## Deferred (not in this batch)

| Finding | Reason deferred |
|---------|----------------|
| WatermelonDB `onSetUpError` recovery | Adds new code path; no real users yet — revisit in Phase 6 |
| `Draft` model missing `created_at` | Requires WatermelonDB schema version bump + migration; defer to next planned schema change |
| `isAuthenticated` redundant state | Low-risk refactor, no production impact — can clean up alongside Phase 6 auth work |
| Sync retry status (`failed` → `pending`) | Depends on Phase 7 `pushToServer` implementation; not worth fixing a stub |

---

## Merge Order

PRs must merge sequentially — each builds on `master` after the previous is merged.

```
PR 1 (backend hardening)
  → PR 2 (refresh race)
  → PR 3 (sync queue)
    → PR 4 (login query)
```

After each merge: pull `master`, rebase the next branch if needed.
