# QuoteSnap codebase fitness audit

**Date:** 2026-09-08  
**Tree:** `master` @ `b9c313e` (after GitHub PRs #5–#10)  
**Method:** Read-only review of paths **not** heavily touched by recent PRs, scored against [CONTEXT.md](../CONTEXT.md) invariants and [`.planning/REQUIREMENTS.md`](../.planning/REQUIREMENTS.md). Prefer reporting over rewrite.

**Scope:** mobile screens/navigation beyond the voice/sync happy path; catalog CRUD; quote draft editing; auth/session refresh; backend routes beyond voice/login; Postgres vs WatermelonDB; money; stubs (Twilio/FCM/approval); env drift; dead code; security; ESM; RN flags.

No Phase 6 SMS, Railway/EAS, or large refactors were implemented in this pass.

---

## How to use this doc

Each finding is a board-ready task: **symptom**, **where**, **why it is unfit vs CONTEXT**, **suggested fix direction** (not a line-by-line patch). Rank:

| Rank | Meaning |
|------|---------|
| **P0** | Breaks the contractor-facing core loop or session today |
| **P1** | Shipped feature is wrong, unsafe, or will lose data; should be a ticket before more product work |
| **P2** | Stale, dead, or architecturally sloppy; fix when touching the area |

---

## Summary table

| ID | Rank | Area | Symptom |
|----|------|------|---------|
| A-01 | P0 | Auth / API client | Wrong password (and other `/auth` 401s) become “Session expired”; invalid refresh can deadlock |
| A-02 | P1 | Sync architecture | Write-only sync; `fetchCatalogItems` / `fetchQuotes` never called; reinstall/new device is empty |
| A-03 | P1 | Onboarding | Offline seed never reaches the server; voice GPT maps an empty catalog |
| A-04 | P1 | Catalog | Seeded units (`per foot` / `per light` / `per vent`) are rejected by `PUT /catalog` |
| A-05 | P1 | Catalog | Undo-unarchive cannot sync; no unarchive API |
| A-06 | P1 | Quotes API | `PUT /quotes/:id` has no status machine, no cents checks, non-transactional line replace, drops confidence |
| A-07 | P1 | Onboarding API | Seed is not transactional; concurrent/partial seed can 409 with a half catalog |
| A-08 | P1 | Voice client | `voice.ts` bypasses `apiClient`; expired access token during poll/upload is not refreshed |
| A-09 | P1 | History | Quote detail with `serverId` needs the network; contradicts HIST-04 |
| A-10 | P1 | Quotes UI | `ai_failed` and `failed_send` share the “Failed” badge; `ai_failed` opens read-only detail |
| A-11 | P1 | Auth | `/auth/register` is not rate-limited |
| A-12 | P1 | Navigation | Onboarding lands on a stub Home tab (logout only), not Quotes |
| A-13 | P2 | Auth | Refresh rotation has no row lock; `JWT_REFRESH_SECRET` unused |
| A-14 | P2 | Money / schema | No CHECK on `*_cents` or `quotes.status`; client-supplied totals trusted |
| A-15 | P2 | Catalog sync | Create payload omits `tradeCategory`; grouping is a no-op |
| A-16 | P2 | Auth UI | AUTH-01 phone login/register exists on the API, not in the app |
| A-17 | P2 | Draft editor | Phone field enqueues a sync item per keystroke; `find()` has no catch |
| A-18 | P2 | Env / comments | `.env.example` missing `WHISPER_LANGUAGE`; stale JSI comment; unused Postgres `catalog_items.server_id` |
| A-19 | P2 | Dead / stub | Home, “Settings” copy, `fcm_token`, Expo `web`, unused fetch helpers |
| A-20 | P2 | Privacy | Voice worker logs the full Whisper transcript |

---

## Intentionally skipped (recent PRs already covered)

Do **not** re-open these as primary work unless a new regression shows up. Verified still present on this `master`; not re-litigated below.

| PR | What was reviewed / fixed | Still-open leftover (CONTEXT already records) |
|----|---------------------------|--------------------------------------------------|
| **#5** | CI workflow, typecheck/test scripts | — |
| **#6** | Phase 5 physical UAT runbook (`docs/UAT-PHASE5.md`) | Device UAT not signed off |
| **#7** | Login identifier lock-down; UUID catalog filter; R2 delete after commit; `ai_failed` on upload/enqueue failure; Whisper default `en`; AI failures ≠ `failed_send` | **`quoteServerId` reuse is implemented** (`POST /voice/upload` + mobile retry stamp). Local `ai_processing` without `voiceJobId` is still not polled. |
| **#8** | Sync retry/backoff/`dead_letter`, single-flight `processQueue`, audio parent guard, NetInfo unsubscribe | Dead-letter **UI** (`SYNC-04`) shipped (PR #31). Draft conflict UX (`SYNC-05`) is not built. |
| **#9** | `ai-processing-reaper`; `/voice/status` returns `failed` when quote is `ai_failed` | Poller still requires `voiceJobId` (see #7 leftover) |
| **#10** | `CONTEXT.md` / planning stubs | — |

Also **not** in this audit’s fix list (by instruction): Phase 6 SMS/Twilio/approval pages, Railway/EAS, `newArchEnabled` / `jsi` flips, GSD ceremony.

**RN flags (checked, leave them):** `newArchEnabled: false` in `apps/mobile/app.config.ts`; `SQLiteAdapter({ jsi: false })` in `apps/mobile/src/db/index.ts`.

**ESM (checked, healthy):** backend `"type": "module"` relative imports use `.js` extensions.

**Tenant scoping (checked, healthy for IDOR):** catalog, quotes, and voice draft/status queries include `contractor_id` from the JWT. No cross-tenant read found in those routes.

---

## P0

### A-01 — `apiClient` 401 interceptor is unfit for auth routes

**Symptom.** On the login screen, a wrong password returns HTTP 401 `{ error: "Invalid credentials" }`. `apps/mobile/src/api/client.ts` treats **every** 401 as an expired session: it calls `refreshSession()`, which returns `false` (no refresh token), then `logout()`, then throws `{ error: "Session expired" }`. The login screen displays that string.

If an access token **is** present and `/auth/refresh` itself 401s, `getOrRefreshSession()` returns the **same in-flight promise** that is waiting on that request → the refresh never settles (deadlock). A **network** error during refresh after a 401 also looks like a failed refresh and forces logout (and may revoke a still-valid refresh token via `POST /auth/logout`).

**Where.** `apps/mobile/src/api/client.ts`; `apps/mobile/src/api/auth.ts` (`login` / `register` / `refresh` / `logout` all use `apiClient`); `apps/mobile/src/store/auth-store.ts` (`refreshSession` catch-all → `false`).

**Why unfit.** AUTH-01/02: contractors must be able to log in and stay logged in. CONTEXT: 15-minute access + 30-day refresh rotation. The interceptor was built for **resource** 401s, then wired under **auth** calls.

**Suggested fix.** Do not run the 401→refresh→logout path for `/auth/*`. Distinguish “refresh token rejected” from “refresh HTTP failed”. Persist rotated tokens even on the restore path where `contractor` is still null (`auth-store.refreshSession`). Add tests around wrong-password and refresh-401. Do not silently `logout()` on transport errors.

---

## P1

### A-02 — Sync is write-only; login never hydrates local SQLite

**Symptom.** `fetchCatalogItems()` and `fetchQuotes()` are defined and unused. After reinstall, app-data clear, or login on a second device, WatermelonDB is empty. Returning users with `trade` set skip onboarding (`auth-store.login` → `onboardingComplete: true`), so they never seed locally. Catalog and quote history screens are empty even though Postgres has rows.

**Where.** `apps/mobile/src/api/catalog.ts`, `apps/mobile/src/api/quotes.ts`; no call sites. Login/restore in `auth-store.ts`. `GET /quotes` also omits `voice_job_id` and line items, so a future pull could not reconstruct polling or drafts from that payload alone.

**Why unfit.** CONTEXT invariant 6 (offline-first). CAT-06 / HIST-04: catalog and history available from local SQLite. AUTH-04 skips onboarding for existing sessions — which is correct **only if** local state is restored or pulled. SYNC-05 (“server-as-truth”) has no download path.

**Suggested fix.** After login/restore, pull catalog (including a way to see archived if undo is required) and quotes+line items into WatermelonDB, keyed by `server_id`. Extend `GET /quotes` if the client needs `voice_job_id` / line items. This is a real feature slice (not a one-liner).

### A-03 — Offline onboarding catalog never syncs to the server

**Symptom.** `seeding.tsx` on timeout/failure writes `OFFLINE_TRADE_TEMPLATES` with `serverId = null` and does **not** `enqueue` creates. `setOnboardingComplete` only sets local SecureStore + Zustand `trade`. Server `contractors.trade` stays null; server `catalog_items` stay empty. Voice GPT loads the **server** active catalog (`voice-processor.ts`) → empty mapping.

**Where.** `apps/mobile/app/(auth)/onboarding/seeding.tsx`; `apps/mobile/app/(auth)/onboarding/ready.tsx`; no enqueue in the offline branch.

**Why unfit.** ONBD-04 is still unchecked, but the code presents offline seed as a working fallback. CONTEXT: GPT must map onto **that contractor’s catalog**. A “successful” offline onboard produces a local catalog the AI cannot see.

**Suggested fix.** Either block “ready” until seed has a server ack, or enqueue local items + a seed/trade update when back online, with de-dupe against a later successful `/onboarding/seed`. Do not treat ONBD-04 as done until that path exists.

### A-04 — Catalog unit allow-list does not match seeded templates

**Symptom.** Templates use `per foot`, `per light`, `per vent`. `POST`/`PUT /catalog` only allow `each | hour | foot | sqft | job`. Seed `INSERT` bypasses that list. Editing those items from `ItemFormSheet` (which only offers the five units) and saving sends a unit the API rejects — or leaves a unit with no pill selected.

**Where.** `apps/backend/src/data/trade-templates.ts` (and mobile `OFFLINE_TRADE_TEMPLATES`); `apps/backend/src/routes/catalog.ts` `VALID_UNITS`; `apps/mobile/src/components/catalog/item-form-sheet.tsx` `UNITS`.

**Why unfit.** CAT-02 (edit existing items). One source of truth for units is missing. Money/name edits on starter SKUs are blocked or surprising.

**Suggested fix.** One shared unit enum used by templates, API, and the form (either add the three template units or change templates to `foot` / `each`). Validate seed inserts against the same list.

### A-05 — Catalog archive undo cannot unarchive on the server

**Symptom.** Archive enqueues `{ isArchived: true }` → `PATCH /:id/archive`. Undo enqueues `{ isArchived: false }`. `pushToServer` only treats `isArchived === true` as archive; otherwise it `PUT`s name/unit/price, all undefined → `400 At least one field required`. There is no unarchive route. Archive is one-way in Postgres.

**Where.** `apps/mobile/app/(app)/catalog.tsx` `handleUndo`; `apps/mobile/src/sync/sync-queue.ts` catalog update branch; `apps/backend/src/routes/catalog.ts` `PATCH /:id/archive`.

**Why unfit.** CAT-03 is soft-delete with undo in the UI. After the toast, the server stays archived; a future pull (A-02) would hide the item. Offline-first “undo” is a lie once the archive sync has succeeded.

**Suggested fix.** Either `PATCH /:id/archive` with `{ archived: boolean }`, or a dedicated unarchive. Map undo payload to that. Do not `PUT` empty bodies.

### A-06 — Quotes write API does not enforce snapshot/money/status invariants

**Symptom.**

- `POST`/`PUT /quotes` accept any `status` string (`approved`, `sent`, `failed_send`, …) with no allow-list or transition table.
- `totalCents` is not required to be an integer ≥ 0; line-item `quantity` / `unitPriceCents` are not checked.
- Line-item replace is `DELETE` then per-row `INSERT` **outside a transaction** (`query()` has no client). A mid-loop failure wipes lines.
- Re-insert does not write `confidence` or `catalog_item_id`. First draft sync from the mobile queue (`draft` entity → `updateQuoteOnServer({ lineItems })`) **strips AI provenance**.

**Where.** `apps/backend/src/routes/quotes.ts`; `apps/backend/src/types/quotes.ts`; `apps/mobile/src/sync/sync-queue.ts` draft/quote update; migrations `003_quotes.sql` / `004_voice.sql` (no CHECK).

**Why unfit.** CONTEXT: money is integer cents; line items are snapshots (`name` + `unit_price_cents`, optional `catalog_item_id`); `failed_send` ≠ `ai_failed`; there is **no** `quote_snapshots` table yet — the live `quote_line_items` rows **are** the draft. Unchecked status writes make Phase 6 approval meaningless if a client can self-approve now. Voice confidence tiers (VOICE-08) disappear from the server copy after an edit.

**Suggested fix.** Allow-list statuses (and, until Phase 6, reject `sent`/`approved`/`declined`/`expired`/`failed_send` from the client). Validate cents/qty as integers. Wrap delete+insert in one transaction. Persist `confidence` + `catalog_item_id` on replace (or document that drafts are local-only until send). Recompute `total_cents` server-side from line rows.

### A-07 — Onboarding seed is not atomic

**Symptom.** Seed sets `contractors.trade`, then inserts template rows in a loop. Failure after the trade update → retry gets `409 Catalog already seeded` with a partial catalog. Two concurrent seeds can both see `trade IS NULL` and double-insert.

**Where.** `apps/backend/src/routes/onboarding.ts`.

**Why unfit.** ONBD-02: one pre-seeded catalog. CONTEXT: parameterized SQL is not enough without a transaction around the seed.

**Suggested fix.** Single transaction: lock contractor row, insert items, set trade. Unique `(contractor_id, name)` optional. Keep 409 for a completed seed.

### A-08 — Voice HTTP helpers do not refresh tokens

**Symptom.** `uploadAudio` / `getVoiceStatus` / `getDraftLineItems` use raw `fetch` + current access token. No 401 retry. Access tokens last 15 minutes. A poll that starts near expiry, or a queued upload after the token died, fails until the next `apiClient` call happens to refresh.

**Where.** `apps/mobile/src/api/voice.ts` vs `apps/mobile/src/api/client.ts`.

**Why unfit.** AUTH-02 rolling session; VOICE-07 1.5s polling. CONTEXT known poller issues are about `voiceJobId`; this is a separate session hole.

**Suggested fix.** Route these calls through `apiClient` (multipart upload needs a non-JSON body path) or share the refresh coalescer. Never attach a dead interceptor to `/auth/refresh` (A-01).

### A-09 — Quote history detail is online-only once `serverId` exists

**Symptom.** `quote/[id].tsx`: if `q.serverId` is set, line items come only from `GET /quotes/:id`. Failure → “Connect to the internet to view full details” even when the local `drafts` row has JSON. Manual quotes that have synced are not readable offline.

**Where.** `apps/mobile/app/(app)/quote/[id].tsx`.

**Why unfit.** HIST-04: history accessible offline. CONTEXT invariant 6.

**Suggested fix.** Always read local draft/line snapshot first; use the network to refresh, not as the only source.

### A-10 — `ai_failed` is not a recoverable, distinct UI state

**Symptom.** `StatusBadge`: `ai_failed` and `failed_send` both label **Failed**. `quotes.tsx` `handleQuotePress` only sends `draft_local` to the draft editor; `ai_failed` opens read-only `quote/[id]`. No retry-with-audio (FAIL-04) and no manual fallback (FAIL-05).

**Where.** `apps/mobile/src/components/quotes/status-badge.tsx`; `apps/mobile/app/(app)/quotes.tsx`.

**Why unfit.** CONTEXT invariant 10: `failed_send` is SMS (Phase 6); `ai_failed` is the voice pipeline. FAIL-04/05 still open — this is the current UX hole, not a request to build SMS.

**Suggested fix.** Distinct copy (e.g. “Couldn’t process audio”). Open `ai_failed` in the draft editor with empty/partial lines and a path to re-record or add catalog items. Keep `failed_send` unused until Phase 6.

### A-11 — Register is unthrottled

**Symptom.** `authLimiter` (6 / 15 min) is on login and refresh only. `POST /auth/register` is open. 409 on duplicate email/phone enumerates accounts.

**Where.** `apps/backend/src/routes/auth.ts`.

**Why unfit.** Same abuse surface as login. CONTEXT calls out rate-limited login/refresh; register was left off.

**Suggested fix.** Apply the same limiter (or stricter) to register. Dummy bcrypt on unknown login is a later hardening step (P2).

### A-12 — App Home is a Phase 1 stub; onboarding routes there

**Symptom.** `(app)/index.tsx` is welcome + Log Out. `ready.tsx` `router.replace('/(app)')` lands on that tab. Quotes and Catalog are other tabs. Ready copy mentions **Settings**, which does not exist.

**Where.** `apps/mobile/app/(app)/index.tsx`, `_layout.tsx`, `onboarding/ready.tsx`.

**Why unfit.** CONTEXT core loop is quotes/catalog/voice, not a dead home. Contractors can think the app “did nothing” after seed.

**Suggested fix.** Default tab = Quotes (or replace Home with a thin dashboard that links to Voice/Catalog). Remove Settings copy until ACCT exists.

---

## P2

### A-13 — Refresh-token rotation and unused secret

**Symptom.** Refresh is `SELECT` then `UPDATE revoked_at` then insert, without `FOR UPDATE`. Two overlapping refreshes can both pass the select. Client coalescing (PR #2) reduces but does not close the server race. `JWT_REFRESH_SECRET` is in `.env.example` and never read (refresh tokens are opaque SHA-256 hashes, not JWTs).

**Where.** `apps/backend/src/routes/auth.ts`; `apps/backend/.env.example`.

**Suggested fix.** Rotate in one transaction with a row lock; reuse-detection later. Delete or comment `JWT_REFRESH_SECRET` so operators do not think refresh JWTs exist.

### A-14 — Schema does not enforce money or status

**Symptom.** Only CHECK in migrations is `email_or_phone`. `unit_price_cents`, `total_cents`, `quantity` have no `> 0` / integer checks. `quotes.status` is free `VARCHAR(30)`. Postgres `catalog_items.server_id` (migration 002) is unused (mobile `server_id` is the **client** mapping to the row’s `id`).

**Why unfit.** CONTEXT invariant 1. A bad client or A-06 can persist `$0` or fractional cents as floats through JS if they ever skip `Number.isInteger`.

**Suggested fix.** New migration: CHECK constraints + status enum/check. Do not confuse Postgres `catalog_items.server_id` with Watermelon `server_id`.

### A-15 — Catalog create sync drops `tradeCategory`; CAT-05 grouping is a no-op

**Symptom.** New items set local `tradeCategory` to `contractor.trade` (`plumbing` etc.). Enqueue payload does not send it; server stores `null`. Templates also use the trade name as the only category, so `SectionList` has a single section.

**Where.** `catalog.tsx` create enqueue; `sync-queue.ts` create; templates.

**Suggested fix.** Include `tradeCategory` in the create payload. If CAT-05 means “Drain vs Fixtures”, templates need real categories; if it means “one list per trade”, simplify the UI.

### A-16 — Phone auth is API-only

**Symptom.** Login/register screens require email. Backend AUTH-01 still accepts phone.

**Where.** `apps/mobile/app/(auth)/login.tsx`, `register.tsx`.

**Suggested fix.** Identifier field (email or E.164 phone) matching `resolveLoginIdentifier`, plus normalize phone on write.

### A-17 — Draft editor robustness

**Symptom.** `handlePhoneChange` enqueues on every `onChangeText`. Rapid typing can flood `sync_queue_items` (each is its own retry row). `database.get('quotes').find(id)` in draft and quote-detail has no `catch` — missing id leaves `loading` forever or an unhandled rejection.

**Where.** `apps/mobile/app/(app)/draft/[id].tsx`, `quote/[id].tsx`.

**Suggested fix.** Debounce phone sync; catch `find` and show “Quote not found”.

### A-18 — Env and comment drift

**Symptom.** CONTEXT says `WHISPER_LANGUAGE` is commented in `.env.example`; it was missing (this PR adds it). `app.config.ts` plugin comment still talks about `jsi: true` while the adapter is `jsi: false` (comment clarified in this PR). Do not flip those flags.

**Suggested fix.** Keep `.env.example` aligned with CONTEXT. Treat JSI comments as a foot-gun.

### A-19 — Dead code and Phase 6 stubs (do not build SMS)

| Item | Notes |
|------|--------|
| `contractors.fcm_token` | Column only; FAIL-08 / SMS-08 not started |
| Twilio / approval routes | None; Phase 6 |
| `fetchCatalogItems` / `fetchQuotes` | Were unused at audit time; **now used by A-02 hydrate — keep them** |
| Expo `web` in `app.config.ts` | Product is mobile-first; no CORS on the API |
| `.gitignore` `review code/` | Leftover tooling path |
| Quotes empty state | Reuses catalog “Add Item” copy |

**Addressed (hygiene PR, not Phase 6):** Home tab removed (index redirects to Quotes; logout is a header action); quotes empty copy is quote-specific; Expo `web` dropped; `review code/` gitignore line removed; `fcm_token` COMMENT in migration `008` (column kept). Twilio/approval/FCM still not built.

### A-20 — Transcript logging

**Symptom.** `voice-processor.ts` `console.log` of the full Whisper transcript. Audio is PII (CONTEXT invariant 11); logs are a second copy.

**Suggested fix.** Log job/quote ids and length, not transcript text, in any environment that retains logs.

---

## What looks healthy (do not churn)

- Backend relative imports use `.js` (invariant 7).
- `newArchEnabled: false` and `jsi: false` (invariant 8).
- Catalog/quotes/voice lookups tenant-scope on `contractor_id` (invariant 9).
- Voice validation still drops non-UUID / non-catalog IDs; GPT path does not take AI prices (invariants 4–5). Worker still deletes R2 **after** DB commit (invariant 11; PR #7).
- UI money formatting (`/ 100`, `Math.round(parsed * 100)`) in catalog form, price sheet, quote row/detail — storage stays cents.
- Login lookup is single-identifier (PR #7). Sync backoff/single-flight/audio parent (PR #8) and reaper (PR #9) are in tree.
- `failed_send` is not written by the voice worker (invariant 10, server-side).

---

## Suggested board grouping

1. **Session correctness** — A-01, A-08, A-11, A-13 (auth interceptor + voice fetch + register limit).  
2. **Offline truth** — A-02, A-03, A-09 (pull + offline seed + history).  
3. **Catalog fitness** — A-04, A-05, A-15 (units, unarchive, category).  
4. **Quotes write path** — A-06, A-07, A-14 (status/money/transactions).  
5. **Contractor UX** — A-10, A-12, A-16, A-17 (failed voice, home, phone, debounce).  
6. **Hygiene** — A-18, A-19, A-20.

---

## This PR’s code changes

Docs-adjacent only (no behavior change):

- Document `WHISPER_LANGUAGE` in `apps/backend/.env.example` (CONTEXT already described it).
- Clarify the WatermelonDB plugin comment so it does not imply `jsi: true`.

No tests added (markdown + comments). CI should match `master` aside from these files.
