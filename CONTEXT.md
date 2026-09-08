# QuoteSnap — agent context

**This is the canonical briefing for Cursor/cloud agents.** Prefer it over `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`, and any `.claude/` session prompt.

Requirement IDs (`AUTH-01`, `VOICE-06`, `SMS-03`, …) live in [`.planning/REQUIREMENTS.md`](.planning/REQUIREMENTS.md). Keep those IDs; do not invent a parallel vocabulary.

Phase PLAN / SUMMARY / RESEARCH files under `.planning/phases/` are **historical**. They describe how code was built, not whether it is current.

---

## Product

Mobile-first quoting for solo trade contractors (plumbing, electrical, HVAC). Contractor describes a job by voice; Whisper + GPT-4o map the transcript onto **that contractor’s catalog** (no AI-invented prices); contractor reviews/edits the draft. SMS send + customer approval is **Phase 6 and is not implemented**.

Core loop on `master`: register/login → trade onboarding + catalog seed → catalog CRUD → record voice or create a manual draft → review line items → “Send” currently only marks the quote `draft_queued` locally (no Twilio).

---

## Status on `master` (2026-09-07)

Verified against HEAD `7d841fd` (merges of GitHub PRs #8 and #9 on top of #7). Re-check GitHub before treating anything else as landed.

| Phase | In code? | Honest status |
|-------|----------|----------------|
| 1 Foundation (auth + WatermelonDB) | Yes | Shipped. PRs #1 (rate-limit / pool) and #2 (refresh coalesce) merged. |
| 2 Onboarding | Yes | Shipped. `ONBD-03` (90s on 1-bar LTE) and `ONBD-04` (offline seed) not human-validated. |
| 3 Catalog management | Yes | Shipped (`CAT-01`…`CAT-06`). |
| 4 Quote review + history | Yes | Shipped (`REVIEW-*`, `HIST-*`). |
| 5 Voice-to-quote | Yes | **Code-complete.** All four plans have SUMMARY files. Physical Android UAT is still open (see `.planning/PHYSICAL-DEVICE-TESTING.md` and `05-HUMAN-UAT.md`). Stale `ai_processing` rows are reaped to `ai_failed` (PR #9). |
| 6 SMS + customer approval | No | Not started (`SMS-01`…`SMS-10`). |
| 7 Sync hardening + 16 failure scenarios | Partial | **PR #8 landed `SYNC-03`:** retry/backoff `5s → 15s → 60s → 5m → 15m` then `dead_letter`, single-flight `processQueue`, audio-parent guard, NetInfo unsubscribe. Dead-letter **UI** (`SYNC-04`), conflict UX (`SYNC-05`), and `FAIL-*` coverage are **not** done. |
| Backlog 999.1 Railway + EAS demo | Partial | Root `build`/`start` scripts exist for Railway. `app.config.ts` reads `EXPO_PUBLIC_API_URL`. **No `eas.json` / `railway.toml` in the repo.** Do not claim a live demo deploy. |

Recent **merged** work to reflect if you mention status:

- **PR #5** — CI workflow + typecheck/test scripts.
- **PR #7** — login identifier lock-down (D1), UUID filter before catalog `ANY($2::uuid[])` (D2), R2 delete after successful GPT+DB commit (D3), `ai_failed` on upload/enqueue failure (D7), Whisper default English (D8), AI failures write `ai_failed` not `failed_send` (D9).
- **PR #12** — `apiClient` no longer treats `/auth/*` 401s as session expiry (audit **A-01**).
- **PR #8** — mobile sync queue: failures stay `pending` with `nextRetryAt` backoff; `dead_letter` after the 15m attempt fails; `createSingleFlight` so overlapping `processQueue` calls do not double-write; `resolveAudioQuoteServerId` (no empty parent id on `/voice/upload`); NetInfo unsubscribe + root-layout teardown. Also picks up pre-existing `failed` rows. Dead-letter UI (`SYNC-04`) unchanged.
- **PR #9** — pg-boss cron `ai-processing-reaper` (`* * * * *` UTC) marks quotes still `ai_processing` older than `AI_PROCESSING_TIMEOUT_MS` (default 15 minutes) as `ai_failed`. `GET /voice/status/:jobId` returns `{ status: 'failed' }` when the owned quote is already `ai_failed`, even if the pg-boss job is still active or gone, so the mobile poller stops.

**Still open (docs, not these fixes):**

- **PR #6** — draft Phase 5 UAT runbook.
- **PR #4** — older GSD ROADMAP/STATE/PROJECT rewrite; superseded by this `CONTEXT.md` approach.

Do **not** implement Phase 6 SMS, Railway/EAS, or product features unless a task explicitly asks.

---

## Monorepo layout

npm workspaces, two apps:

```
apps/mobile/     Expo 52, RN 0.76.5, expo-router, WatermelonDB 0.27.1, Zustand
apps/backend/    Express, raw `pg` via `query()`, pg-boss, OpenAI, R2
apps/backend/src/db/migrations/   001_foundation … 005_ai_failed
apps/mobile/src/db/               schema v2, models, SQLiteAdapter
apps/mobile/src/sync/             enqueue + processQueue (retry/backoff, single-flight, audio parent) + login/restore hydrate
.github/workflows/ci.yml
```

There is no root `README.md`. Native `android/` and `ios/` are gitignored (Expo prebuild locally / EAS later).

### Backend routes (`apps/backend/src`)

| Mount | Role |
|-------|------|
| `GET /health` | Liveness |
| `/auth` | register, login, refresh, logout (rate-limited login/refresh) |
| `/onboarding` | trade catalog seed |
| `/catalog` | CRUD + `PATCH /:id/archive` |
| `/quotes` | list/create/update quotes + line items |
| `/voice` | `POST /upload`, `GET /status/:jobId`, `GET /draft/:quoteId` |

Workers: `voice-processor.ts` (pg-boss queue `voice-process`) and `ai-processing-reaper.ts` (queue `ai-processing-reaper`, every minute). No Twilio, FCM, or approval-page routes.

### Mobile screens (`apps/mobile/app`)

- `(auth)` — login, register, onboarding (trade / seeding / ready)
- `(app)` — quotes list, catalog, `voice-record`, `draft/[id]`, `quote/[id]`

---

## Invariants (do not break)

1. **Money is integer cents.** Columns and fields are `*_cents` / `*Cents`. UI may format dollars; storage and API stay integers.
2. **`quote_line_items` are snapshots.** Persist `name` + `unit_price_cents` on the row. Catalog price edits must not rewrite historical quotes. Optional `catalog_item_id` (migration `004_voice.sql`, `ON DELETE SET NULL`) is provenance for AI rows — not a live price join.
3. **There is no `quote_snapshots` table.** Older planning docs claimed a write-once snapshot + DB trigger. That is a **Phase 6** design (`SMS-02` / `SMS-04`), not present in migrations. Do not document it as shipped.
4. **GPT-4o returns catalog IDs + quantities + confidence only.** System prompt + function calling; backend `filterUuidCatalogIds` then `validateAndBuildLineItems` against the contractor’s **active** catalog. Drop unknown IDs; never pass through AI-invented names/prices.
5. **Confidence in the UI is tiers, never raw floats.** `confidenceTier()`: `≥0.85` clean (no badge), `0.60–0.84` “Review” (amber), `<0.60` “Needs Input” (red, auto-scroll). `LineItemRow` takes `'review' | 'needs_input'`.
6. **Offline-first.** Quotes, catalog, drafts, and `sync_queue_items` live in WatermelonDB. Retrofitting online-first is a rewrite.
7. **Backend ESM.** `apps/backend/package.json` has `"type": "module"`; `tsconfig` is NodeNext. Relative imports **must** use `.js` extensions (`from "./routes/auth.js"`).
8. **WatermelonDB adapter:** `newArchEnabled: false` in `apps/mobile/app.config.ts`; `SQLiteAdapter({ jsi: false })` in `apps/mobile/src/db/index.ts`. Do not flip these without a native rebuild and device verification. (An early decision to enable JSI was reversed for RN 0.76.)
9. **SQL is parameterized and tenant-scoped.** Catalog/quote lookups always include `contractor_id` from the JWT.
10. **`failed_send` ≠ `ai_failed`.** `ai_failed` is the voice pipeline; `failed_send` is reserved for SMS (Phase 6).
11. **Audio PII:** delete from R2 **after** Whisper + GPT + DB commit succeed, not immediately after transcription. Delete failures after success are logged; they must not fail the job (avoids duplicate line items on retry).

---

## Environment

### Database

- Backend reads `DATABASE_URL` (`apps/backend/.env`).
- `.env.example` shows Postgres on **5432**.
- Local convention documented in this repo: Docker container `quotesnap-db` is published on **5433** so it does not collide with a host Postgres on 5432. Match the port in the `.env` you actually use.
- Start DB before the API: `docker start quotesnap-db`
- Migrations: `cd apps/backend && npm run migrate` (files `001`…`005`).

### Backend

```bash
cd apps/backend && npm run dev    # tsx watch, default PORT=3000
```

`app.listen(PORT)` (no explicit host). For a physical phone, Windows/macOS firewall must allow inbound TCP 3000. Required env: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OPENAI_API_KEY`, `R2_*` (see `apps/backend/.env.example`). Optional: `WHISPER_LANGUAGE` — default **`en`**; set `he` for Hebrew; empty string opts into Whisper auto-detect. Optional: `AI_PROCESSING_TIMEOUT_MS` — default **900000** (15 minutes); commented in `.env.example`.

Auth: 15-minute JWT access tokens; 30-day refresh tokens stored as SHA-256 hashes; rotation on refresh. Login uses **one** identifier (email wins if both present) — never `WHERE email = $1 OR phone = $2 LIMIT 1`.

### Mobile API URL (physical device)

`apps/mobile/src/api/client.ts` and `voice.ts` read `Constants.expoConfig.extra.apiUrl`, which comes from `EXPO_PUBLIC_API_URL` in `apps/mobile/app.config.ts`.

**Fallback is `http://10.0.2.2:3000` (Android emulator only).** A physical phone cannot reach `10.0.2.2`. Set `EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000` in a local `apps/mobile/.env` (gitignored). Do not commit a home LAN IP.

Device UAT: [`.planning/PHYSICAL-DEVICE-TESTING.md`](.planning/PHYSICAL-DEVICE-TESTING.md).

### CI-equivalent (Node 22)

```bash
npm ci
npm run typecheck --workspace=apps/backend
npm run typecheck --workspace=apps/mobile
npm run lint --workspace=apps/mobile
npm run test --workspace=apps/backend
npm run test --workspace=apps/mobile
```

Root `package.json` has no `test` script; CI invokes workspaces. On current `master`, backend tests cover login-lookup, voice-validation (including UUID filter), whisper-language, the ai-processing reaper, and quotes list payload nesting (`voiceJobId` + line items). Mobile tests cover confidence, line-items, quote-validation, sync retry/backoff, single-flight, audio parent, NetInfo, `processQueue`, auth 401 handling, and login/restore catalog+quote hydrate.

---

## Known gaps (still true in tree — verify before “fixing”)

These are **on `master` after PRs #8, #9, and #12**. Do not re-implement retry/single-flight, the reaper, or the auth 401 interceptor.

- **Dead-letter UX (`SYNC-04`) and draft conflict UX (`SYNC-05`)** are not built. Queue items can reach `dead_letter`; there is no contractor-facing retry screen.
- **Offline onboarding seed still does not enqueue** (audit **A-03**). Returning users are hydrated from Postgres after login/restore; a first-run offline seed still never reaches the server.
- **Local `ai_processing` without `voiceJobId` is still not polled** (`quotes.tsx` requires `voiceJobId`). Hydrate now copies `voice_job_id` when the server has it. The server reaper will mark the **server** row `ai_failed` after the timeout; a local row that never received a job id will not learn that unless a later poll/sync path exists. A 500 after enqueue can still insert a second server quote on client retry (PR #7 leftover).
- **Phase 5 UAT** not signed off on a physical Android device.
- **Send Quote** sets `draft_queued` and enqueues a sync payload; no SMS (`SMS-01`).
- **Mic denied** shows an in-app Alert + Settings link (`voice-record.tsx`); other `FAIL-*` scenarios are incomplete. `WORKFLOW-failure-edge-cases.md` is referenced by `FAIL-01` and **is not in the repo**.

When you mention defects, prefer what is in the tree on `master` over open-PR speculation.

---

## Planning docs — what to trust

| Path | Trust |
|------|--------|
| `CONTEXT.md` (this file) | Current agent briefing |
| `.planning/REQUIREMENTS.md` | Requirement IDs and checkbox intent |
| `.planning/phases/**/SUMMARY.md` | Historical “what landed in that plan” |
| `.planning/PHYSICAL-DEVICE-TESTING.md` | Device UAT procedure (fix LAN URL there if you change it) |
| `.planning/STATE.md`, `ROADMAP.md`, `PROJECT.md` | Stubs pointing here — not a second status source |
| `.planning/config.json` | Removed (GSD workflow junk) |
| `.claude/next-session-prompt.md` | Removed (pointed at already-merged `feat/p5-04-pipeline-closure`) |

If STATE/ROADMAP/PROJECT and this file ever disagree, **this file wins**, then the tree.
