# QuoteSnap — failure and edge-case map (FAIL-01)

**Requirement:** [FAIL-01](../.planning/REQUIREMENTS.md) — every scenario below has a defined detection method, UX state, and recovery path.

**Status briefing:** [CONTEXT.md](../CONTEXT.md). Do not treat this file as a live dashboard of product work; it is the scenario catalog plus an honest map onto `master`.

**Do not implement** FAIL-06 (Twilio SMS) or FAIL-08 (FCM) from this document. Those stay Phase 6.

---

## Provenance

`.planning/REQUIREMENTS.md` has referenced `WORKFLOW-failure-edge-cases.md` since the initial v1 definition (`5c0809d`, 2026-03-25). That file was **never committed**. Git history has no `*WORKFLOW*` blob. This document is the canonical reconstruction:

- The seven dedicated IDs **FAIL-02…FAIL-08**
- The nine other failure edges that Phase 7 / original ROADMAP success criteria / CONTEXT already name (sync, pipeline hang, catalog-ID validation, session refresh during voice, expired approval page)

IDs stay as they are in REQUIREMENTS. This file does **not** invent FAIL-09…FAIL-16.

**Status values**

| Status | Meaning |
|--------|---------|
| **done** | Detection, UX, and recovery exist in code on `master` (through PR #77). Physical UAT may still be open. |
| **partial** | Detection and a UX/recovery exist, with a documented gap. |
| **not started** | Defined here only. No product path yet (usually Phase 6). |

---

## Summary

| # | Scenario | Req / related | Status | Evidence |
|---|----------|---------------|--------|----------|
| 1 | Mic permission denied | **FAIL-02** | done | `voice-record.tsx`, `mic-permission.ts` |
| 2 | Android cache eviction of the recording | **VOICE-02** | done | `voice-record.tsx` `moveAsync` → `documentDirectory` |
| 3 | Audio upload fails offline / no radio | **FAIL-03** | done | PR [#53](https://github.com/drkraff/quoteSnap/pull/53) |
| 4 | Whisper transcription fails | **FAIL-04** | done | PR [#48](https://github.com/drkraff/quoteSnap/pull/48) |
| 5 | GPT-4o mapping timeout or failure | **FAIL-05** | done | PR [#48](https://github.com/drkraff/quoteSnap/pull/48) |
| 6 | Voice job stuck in `ai_processing` | reaper (timeout stage) | done | PR [#9](https://github.com/drkraff/quoteSnap/pull/9) |
| 7 | Crash / kill during record or draft edit | **FAIL-07** | done | PR [#54](https://github.com/drkraff/quoteSnap/pull/54) |
| 8 | Sync retries exhausted | **SYNC-03** | done | PR [#8](https://github.com/drkraff/quoteSnap/pull/8) |
| 9 | Dead-letter surfaced with retry | **SYNC-04** | done | `sync-issues.tsx`, `dead-letter.ts` |
| 10 | Pre-send draft content fork | **SYNC-05** | done | PR [#34](https://github.com/drkraff/quoteSnap/pull/34) |
| 11 | Post-send line/total rewrite | **SYNC-06** (thin) | done | PR [#47](https://github.com/drkraff/quoteSnap/pull/47) |
| 12 | GPT unknown catalog IDs / no invented prices | **VOICE-06** | done | `voice-validation.ts`, PRs [#45](https://github.com/drkraff/quoteSnap/pull/45)/[#46](https://github.com/drkraff/quoteSnap/pull/46) |
| 13 | Access token expiry during voice upload/poll | **AUTH-02** / audit A-08 | done | `apps/mobile/src/api/voice.ts` → `apiClient` |
| 14 | Twilio SMS delivery failure | **FAIL-06** | not started | Phase 6; `failed_send` reserved |
| 15 | Expired customer approval page | **SMS-09** | not started | Phase 6; no approval routes |
| 16 | FCM token rotation | **FAIL-08** | not started | Column reserved (`008_fcm_token_comment.sql`) |

FAIL-01 is **done** when this map exists. Implementation of rows 14–16 remains **not started**.

---

## 1 — Mic permission denied (FAIL-02)

**Detection.** `Audio.requestPermissionsAsync()` returns `granted: false` before `createAsync`.

**UX.** In-app Alert (not a redbox / crash): title **Microphone Access Required**, body tells the contractor to allow access in Settings, actions **Cancel** / **Open Settings**.

**Recovery.** `Linking.openSettings()`. Contractor returns and taps the mic again. The Voice Quote FAB stays enabled; the recording screen owns permission state.

**Status: done.** Landed with Phase 5 recording (`apps/mobile/app/(app)/voice-record.tsx`). Copy lives in `apps/mobile/src/quotes/mic-permission.ts` (tested). Photo camera/library denial on the draft (`Photo access needed`) is a separate permission, not FAIL-02.

Related: `apps/mobile/app.config.ts` `microphonePermission` string.

---

## 2 — Android cache eviction of the recording (VOICE-02)

**Detection.** After Stop, expo-av `getURI()` still points at `cacheDirectory`, which Android may delete.

**UX.** None on the happy path. The file is moved before any network work.

**Recovery.** `FileSystem.moveAsync` to `documentDirectory` as `audio-{localQuoteId}.m4a` (`localVoiceAudioPath` in `apps/mobile/src/quotes/voice-audio.ts`). FAIL-03/04 retry that path.

**Status: done.** `apps/mobile/app/(app)/voice-record.tsx` stop handler. Tests: `apps/mobile/src/quotes/voice-audio.test.ts`.

---

## 3 — Audio upload fails offline / no radio (FAIL-03)

**Detection.** NetInfo down, or `POST /voice/upload` fails after Stop. Local quote + m4a already exist. Queue row stays `pending` (SYNC-03 backoff). Quote is **not** marked `ai_failed`.

**UX.** Contractor is **not** Alerted mid-flow. Quotes row shows **Queued** (cloud) until `voiceJobId` is stamped or while offline; accessibility “will retry” / “will upload when online”. Spinner only after the server has the file.

**Recovery.** `processQueue` uploads when connectivity returns. After the 15-minute attempt fails, SYNC-04 dead-letter (scenario 9) — still not a mid-flow error.

**Status: done.** PR [#53](https://github.com/drkraff/quoteSnap/pull/53). `apps/mobile/src/quotes/voice-upload-queue.ts`, `quote-row-display.ts`, `voice-record.tsx`. Tests: `voice-upload-queue.test.ts`, `quote-row-display.test.ts`.

---

## 4 — Whisper transcription fails (FAIL-04)

**Detection.** Worker ASR error → quote `ai_failed` with `ai_failure_stage = asr`. `GET /voice/status/:jobId` returns `{ status: 'failed', failureStage: 'asr' }`. Poller stops.

**UX.** Quotes badge **Couldn't process audio** (not **Send failed**). Tap opens the **draft** editor. Banner: **Couldn't transcribe this recording** + **Retry recording** (if the m4a remains) or **Record again** + **Add items**.

**Recovery.** Retry re-enqueues the same `documentDirectory` file onto the **same** quote (`?quoteId=`). Never `failed_send`. The quotes-list poller must not mark `draft_local` with an empty `[]` when `GET /voice/draft` fails after the job reports complete — that invents “no lines.” Keep polling, or apply nested `GET /quotes/:id` lines when they already arrived. Blank prices stay blank.

**Status: done.** PR [#48](https://github.com/drkraff/quoteSnap/pull/48). `apps/backend/src/voice/ai-failure.ts`, `apps/mobile/src/quotes/ai-failed-recovery.ts`, `retry-voice-quote.ts`, `apps/mobile/src/components/quotes/ai-failed-banner.tsx`. Tests: `ai-failed-recovery.test.ts`, `ai-failure.test.ts`.

---

## 5 — GPT-4o mapping timeout or failure (FAIL-05)

**Detection.** Worker mapping/GPT error after a transcript (or reaper timeout with salvageable lines) → `ai_failed` + `ai_failure_stage = mapping` (or `timeout`). Partial mapped lines may be committed with confidence capped at 0.59 (Needs Input). Blank prices stay blank — never invented.

**UX.** Same draft surface as FAIL-04. Banner: **Couldn't finish this quote from the recording**; flagged lines + **Add items**. `GET /voice/draft/:id` is allowed for `ai_failed`.

**Recovery.** Edit / add catalog items without waiting on AI, or retry the original recording (FAIL-04). Status can move `ai_failed` → `draft_local` / `draft_queued` / `sent` (share).

**Status: done.** PR [#48](https://github.com/drkraff/quoteSnap/pull/48). `apps/backend/src/voice/commit-voice-result.ts`, `apps/backend/src/db/migrations/013_ai_failure_stage.sql`.

---

## 6 — Voice job stuck in `ai_processing`

**Detection.** pg-boss cron `ai-processing-reaper` (`* * * * *` UTC) finds quotes still `ai_processing` older than `AI_PROCESSING_TIMEOUT_MS` (default 15 minutes). Quotes-list poller also recovers `ai_processing` rows that have `serverId` but no `voiceJobId` (`GET /quotes/:id`, PR [#33](https://github.com/drkraff/quoteSnap/pull/33)).

**UX.** Status becomes `ai_failed` with `ai_failure_stage = timeout`. List badge **Couldn't process audio**. FAIL-04/05 draft recovery applies. `GET /voice/status/:jobId` returns `{ status: 'failed' }` even if the pg-boss job is still active or gone, so the poller stops.

**Recovery.** Same as FAIL-04/05 (retry audio / Add items). Do not leave rows spinning forever.

**Status: done.** PR [#9](https://github.com/drkraff/quoteSnap/pull/9). `apps/backend/src/workers/ai-processing-reaper.ts`. Tests: `ai-processing-reaper.test.ts`, `poll-ai-processing.test.ts`.

---

## 7 — Crash / kill during record or draft edit (FAIL-07)

**Detection.** Local Watermelon `resume_checkpoints` row (`voice_recording` while the mic is live, `draft_edit` while the editor is focused). One row per contractor. Not synced. Hydrate does not touch it.

**UX.** After auth restore, Quotes Alert **Resume where you left off** (Resume / Not now). Resume routes to `/voice-record` (optional `?quoteId=` for FAIL-04) or `/draft/:id`. Dismissable.

**Recovery.** Draft edits are already durable (REVIEW-05). After Stop, FAIL-03 owns the queued row — do **not** reopen the mic (`voiceStopAlreadyPersisted`). In-progress expo-av cache takes are **not** copied into SQLite (no custom output path; a truncated m4a is unsafe to auto-upload). Resume reopens the recorder. That limitation is accepted in PR #54; it does not reopen a half-file.

**Status: done.** PR [#54](https://github.com/drkraff/quoteSnap/pull/54). `apps/mobile/src/quotes/resume-checkpoint.ts`, `resume-checkpoint-store.ts`, `use-resume-prompt.ts`. Tests: `resume-checkpoint.test.ts`.

---

## 8 — Sync retries exhausted (SYNC-03)

**Detection.** `processQueue` failure stays `pending` with `nextRetryAt` backoff **5s → 15s → 60s → 5m → 15m**, then `dead_letter`. Single-flight so overlapping runs do not double-write. Pre-existing `failed` rows are picked up.

**UX.** No mid-flow Alert. Pending count / amber indicators; Quotes **Queued** for voice until upload is accepted (scenario 3).

**Recovery.** Automatic until dead-letter; then scenario 9.

**Status: done.** PR [#8](https://github.com/drkraff/quoteSnap/pull/8). `apps/mobile/src/sync/sync-retry.ts`, `sync-queue.ts`. Tests: `sync-retry.test.ts`, `sync-queue.test.ts`.

---

## 9 — Dead-letter surfaced with retry (SYNC-04)

**Detection.** Live Watermelon observe of `sync_queue_items` with `status = dead_letter`.

**UX.** Quotes/Catalog banner + header warning open **Sync issues**: plain-language entity/action + last error + **Retry** (freeze / status-lock copy; never dump a stack). Empty: **All caught up**.

**Recovery.** Retry resets to `pending` (`deadLetterRetryPatch`) and kicks `processQueue` without rewriting stored totals or prices. Frozen-quote money PUTs are parked here instead of retrying into dead-letter via backoff (thin SYNC-06).

**Status: done.** `apps/mobile/app/(app)/sync-issues.tsx`, `apps/mobile/src/sync/dead-letter.ts`, `use-dead-letter-items.ts`. Tests: `dead-letter.test.ts`. PR #75 retry UX (plain-English freeze / status-lock; retry omits payload).

---

## 10 — Pre-send draft content fork (SYNC-05)

**Detection.** Hydrate or GET-before-PUT / GET-before-send vs last observed `updatedAt`. A dirty pre-send draft whose line items disagree with the server is **not** last-write-wins.

**UX.** Local is replaced from the server. Send is blocked behind **Review before sending** (`needs_review` queue marker, not dead-letter). Backend `PUT /quotes` 409 is a **status lock** (plus a specific freeze message when the body tries to change lines/totals on a frozen quote) — content forks are client-side.

**Recovery.** Contractor reviews the server draft, edits if needed, acknowledges `needs_review`, then send/share.

**Status: done.** PR [#34](https://github.com/drkraff/quoteSnap/pull/34). `apps/mobile/src/sync/draft-conflict.ts`, `draft-conflict-sync.ts`, `hydrate.ts`. Tests: `hydrate.test.ts`, `draft-conflict.test.ts`.

---

## 11 — Post-send line/total rewrite (SYNC-06)

**Detection.** Frozen statuses: `sent`, `approved`, `declined`, `expired`, `failed_send`. `PUT /quotes/:id` with `lineItems` or `totalCents` → **409** `Quote line items and totals cannot be changed after send`. No `quote_snapshots` table (SMS-02/04 remain Phase 6).

**UX.** Mobile `processQueue` skips those PUTs and parks a Sync issues row. Share-mark-sent (`draft_*` / `ai_failed` → `sent` + `sent_at`, phone optional, PR [#61](https://github.com/drkraff/quoteSnap/pull/61)) is how freeze starts without Twilio.

**Recovery.** History remains readable. Catalog/draft sync cannot rewrite the snapshot. Phase 6 may later change status without rewriting lines. `failed_send` is frozen for money even though SMS is not built.

**Status: done** (thin). PR [#47](https://github.com/drkraff/quoteSnap/pull/47). `apps/backend/src/quotes/quote-write.ts`, `apps/backend/src/quotes/statuses.ts`.

---

## 12 — GPT unknown catalog IDs / no invented prices (VOICE-06)

**Detection.** `filterUuidCatalogIds` drops non-UUIDs before `ANY($n::uuid[])`. Unknown IDs become adhoc lines (`catalog_item_id` null) with name/qty/unit kept. Prices attach: spoken sell → catalog SKU → exact rate-card → computed labor/material → else blank/`0`. Never a guessed SKU or trade-default price.

**UX.** Draft flags blanks as Unknown. Confidence tiers (Review / Needs Input) without raw percentages (VOICE-08/09). Contractor edits or adds items (REVIEW-*).

**Recovery.** Manual edit / Add items. Rate-card learn on confirm (PR [#44](https://github.com/drkraff/quoteSnap/pull/44)) does not invent rows.

**Status: done.** `apps/backend/src/workers/voice-validation.ts`. PRs [#45](https://github.com/drkraff/quoteSnap/pull/45) (adhoc), [#46](https://github.com/drkraff/quoteSnap/pull/46) (hourly), [#59](https://github.com/drkraff/quoteSnap/pull/59) (markup compute). Tests: `voice-validation.test.ts`.

---

## 13 — Access token expiry during voice upload/poll (AUTH-02 / A-08)

**Detection.** Access JWT is 15 minutes. Voice `upload` / `status` / `draft` used to use raw `fetch` (CODEBASE-AUDIT **A-08**), so a poll near expiry failed until some other `apiClient` call refreshed.

**UX.** No extra voice error when refresh succeeds. `/auth/*` 401s are **not** treated as session expiry (PR [#12](https://github.com/drkraff/quoteSnap/pull/12), A-01). Refresh 401 clears the session and the contractor signs in again.

**Recovery.** `apps/mobile/src/api/voice.ts` routes all three calls through `apiClient` (multipart omits Content-Type so the runtime sets the boundary). Concurrent 401s coalesce on one refresh.

**Status: done.** `apps/mobile/src/api/client.ts`, `voice.ts`. Tests: `voice.test.ts`, `client.test.ts`.

---

## 14 — Twilio SMS delivery failure (FAIL-06)

**Detection (defined, not built).** Twilio webhook / API error after an attempted SMS send. Quote status → `failed_send` (never `ai_failed`).

**UX (defined, not built).** History badge **Send failed** (`status-display.ts` label only). Tap stays **read-only** detail (`quotePressTarget('failed_send') === 'detail'`). Contractor retries send from history.

**Recovery (defined, not built).** Re-attempt Twilio with the existing snapshot. Thin SYNC-06 already freezes line items/totals on `failed_send` so a later catalog sync cannot rewrite the attempted quote.

**Status: not started.** No Twilio, no send-retry UI. In-app **Send** only queues `draft_queued`. Do not implement from this map.

---

## 15 — Expired customer approval page (SMS-09)

**Detection (defined, not built).** Approval token TTL exceeded (SMS-05/10; default 72 hours, value undecided before Phase 6). pg-boss cron marks the quote `expired`.

**UX (defined, not built).** Customer page: neutral **This quote has expired** — not an error page. Contractor history: **Expired**.

**Recovery (defined, not built).** Contractor sends a new quote (new snapshot / token). Do not resurrect the old approval URL.

**Status: not started.** No approval-page routes. Share PDF is not this scenario. Do not implement from this map.

---

## 16 — FCM token rotation (FAIL-08)

**Detection (defined, not built).** Samsung / OEM battery optimization kills the old FCM registration. Login must write a fresh token so SMS-08 approval pushes still arrive.

**UX (defined, not built).** No contractor-facing error on rotation. Stale-token symptom would be a missed approval push (SMS-08), not a crash.

**Recovery (defined, not built).** `contractors.fcm_token` updated on each login. Column exists; unused.

**Status: not started.** Migration `008_fcm_token_comment.sql` COMMENT reserves the column for FAIL-08 / SMS-08. Test: `apps/backend/src/db/fcm-token-comment.test.ts`. Do not drop the column. Do not implement FCM from this map.

---

## Adjacent (not one of the 16)

These have detection/UX/recovery but were not in the FAIL-01 count:

| Topic | Where |
|-------|--------|
| Photo camera/library denied | Draft Alert **Photo access needed** + Settings (`draft/[id].tsx`) |
| Draft Import from photo stub | Adhoc line, **blank price**; not PHOTO-01 Vision (PR [#63](https://github.com/drkraff/quoteSnap/pull/63)) |
| Share PDF print failure | HTML file fallback (`share-customer-quote.ts` `SHARE_QUOTE_FAILED` / unavailable) |
| Offline quote detail | Local draft snapshot first (`load-quote-detail.ts`) |
| Offline onboarding seed | Bundled templates / skippable seed (ONBD-04 still not device-validated) |
| Hard-delete never-synced empty drafts | HIST-05 local destroy, PR [#39](https://github.com/drkraff/quoteSnap/pull/39) |

---

## Checkbox policy

| ID | Checkbox | Why |
|----|----------|-----|
| FAIL-01 | checked | This file defines detection, UX, and recovery for all 16 |
| FAIL-02 | checked | Alert + Settings on the recording screen |
| FAIL-03…05, FAIL-07 | checked | PRs #53, #48, #54 |
| FAIL-06, FAIL-08 | unchecked | Phase 6; defined only |
| SYNC-03…06 | checked | Already complete (thin SYNC-06) |
| SMS-09 | unchecked | Phase 6 |
