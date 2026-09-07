# Phase 1 — historical review punch list

**Canonical context:** [CONTEXT.md](../../CONTEXT.md).

This document was a 2026-04-10 code-review plan. Several items shipped under **different GitHub PR numbers**. Do not open new branches from the names below without checking `master` and open PRs.

| Original item | Status on `master` (2026-09-07) |
|---------------|----------------------------------|
| PR 1 — backend rate-limit + pool `error` no longer `process.exit` | Merged as GitHub **PR #1** (`fix/p1-backend-hardening`) |
| PR 2 — coalesce concurrent 401 refresh | Merged as GitHub **PR #2** (`fix/p1-refresh-race`) |
| PR 3 — sync queue lock, null `serverId` guard, NetInfo cleanup | Merged as GitHub **PR #8** (`apps/mobile/src/sync/`): retry/backoff `5s→15s→60s→5m→15m` then `dead_letter`, single-flight `processQueue`, audio-parent guard, NetInfo unsubscribe. Dead-letter **UI** (`SYNC-04`) still not built. |
| PR 4 — login OR-query | Merged as part of GitHub **PR #7** (`login-lookup.ts`: single identifier, email wins) |

Deferred notes in the original write-up (WatermelonDB `onSetUpError`, Draft `created_at`, `isAuthenticated` redundancy) are still deferred unless a task asks.

Related (not in the original punch list): GitHub **PR #9** merged — `ai-processing-reaper` cron plus `GET /voice/status` returns `failed` when the quote is already `ai_failed`.
