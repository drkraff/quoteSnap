# QuoteSnap — agent context

**This is the canonical briefing for Cursor/cloud agents.** Prefer it over `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`, and any `.claude/` session prompt.

Requirement IDs (`AUTH-01`, `VOICE-06`, `SMS-03`, …) live in [`.planning/REQUIREMENTS.md`](.planning/REQUIREMENTS.md). Keep those IDs; do not invent a parallel vocabulary.

Phase PLAN / SUMMARY / RESEARCH files under `.planning/phases/` are **historical**. They describe how code was built, not whether it is current.

---

## Product

Mobile-first quoting for solo trade contractors (plumbing, electrical, HVAC). Contractor describes a job by voice; Whisper + GPT-4o extract line items (catalog UUID when mapped, otherwise adhoc name/qty/unit) with **no AI-invented prices**; contractor reviews/edits the draft. SMS send + customer approval is **Phase 6 and is not implemented**.

Core loop on `master`: register/login → trade + hourly (markup optional; catalog seed skippable) → catalog CRUD if they want it → record voice or create a manual draft → review line items → archive unwanted quotes from the list (hard-delete only never-synced empty local drafts) → “Send” currently only marks the quote `draft_queued` locally (no Twilio).

---

## Status on `master` (2026-09-15)

Re-check GitHub before treating anything else as landed. This briefing includes merged PRs through **#53** (FAIL-03 quiet offline voice queue). **FAIL-07** (resume after crash) is in this branch.

| Phase | In code? | Honest status |
|-------|----------|----------------|
| 1 Foundation (auth + WatermelonDB) | Yes | Shipped. PRs #1 (rate-limit / pool) and #2 (refresh coalesce) merged. |
| 2 Onboarding | Yes | Shipped. Catalog seed is **optional** (`POST /onboarding/profile` persists trade + hourly without catalog). `ONBD-03` (90s on 1-bar LTE) and `ONBD-04` (offline seed) not human-validated. |
| 3 Catalog management | Yes | Shipped (`CAT-01`…`CAT-06`). |
| 4 Quote review + history | Yes | Shipped (`REVIEW-*`, `HIST-01`…`HIST-05`). `HIST-05` is quote soft-archive (catalog analog) plus an Archived list with Unarchive. Never-synced empty local drafts (`!serverId`) can be hard-deleted from the device. |
| 5 Voice-to-quote | Yes | **Code-complete.** All four plans have SUMMARY files. Physical Android UAT is still open (see `.planning/PHYSICAL-DEVICE-TESTING.md` and `05-HUMAN-UAT.md`). Stale `ai_processing` rows are reaped to `ai_failed` (PR #9). |
| 6 SMS + customer approval | No | Not started (`SMS-01`…`SMS-10`). |
| 7 Sync hardening + 16 failure scenarios | Partial | **`SYNC-03`** retry/backoff then `dead_letter`. **`SYNC-04`** dead-letter UI. **`SYNC-05`** server-as-truth + “Review before sending” on pre-send draft forks. **Thin `SYNC-06`**: `sent` / `approved` / `declined` / `expired` / `failed_send` cannot have line items or totals rewritten by PUT/sync. **`FAIL-03`** offline voice upload stays queued (no mid-flow error). **`FAIL-04`/`FAIL-05`** voice retry + mapping fallback. **`FAIL-07`** crash/kill resume from local SQLite with a “Resume where you left off” prompt. Remaining **`FAIL-*`** (SMS, FCM, FAIL-01/02) are **not** done. |
| Backlog 999.1 Railway + EAS demo | Partial | Root `build`/`start` exist. **`npm start` runs pending SQL migrations then the API** (see [docs/DEPLOY-RAILWAY.md](docs/DEPLOY-RAILWAY.md)). Android internal/preview APK: [docs/EAS-ANDROID.md](docs/EAS-ANDROID.md) (`apps/mobile/eas.json`). `app.config.ts` reads `EXPO_PUBLIC_API_URL`. **No `railway.toml`.** Do not claim a live demo deploy. |

Recent **merged** work to reflect if you mention status:

- **PR #5** — CI workflow + typecheck/test scripts.
- **PR #7** — login identifier lock-down (D1), UUID filter before catalog `ANY($2::uuid[])` (D2), R2 delete after successful GPT+DB commit (D3), `ai_failed` on upload/enqueue failure (D7), Whisper default English (D8), AI failures write `ai_failed` not `failed_send` (D9).
- **PR #12** — `apiClient` no longer treats `/auth/*` 401s as session expiry (audit **A-01**).
- **PR #13** — login/restore hydrate of catalog + quotes (audit **A-02**). Local-only `server_id` null rows are left alone unless a later server seed matches by name (A-03).
- **PR #8** — mobile sync queue: failures stay `pending` with `nextRetryAt` backoff; `dead_letter` after the 15m attempt fails; `createSingleFlight` so overlapping `processQueue` calls do not double-write; `resolveAudioQuoteServerId` (no empty parent id on `/voice/upload`); NetInfo unsubscribe + root-layout teardown. Also picks up pre-existing `failed` rows.
- **PR #9** — pg-boss cron `ai-processing-reaper` (`* * * * *` UTC) marks quotes still `ai_processing` older than `AI_PROCESSING_TIMEOUT_MS` (default 15 minutes) as `ai_failed`. `GET /voice/status/:jobId` returns `{ status: 'failed' }` when the owned quote is already `ai_failed`, even if the pg-boss job is still active or gone, so the mobile poller stops.
- **SYNC-04** — Quotes/Catalog banner + header warning open a Sync issues screen of `dead_letter` queue items (plain-language entity/action + Retry). Live WatermelonDB observe; Retry resets to `pending` and kicks `processQueue`.
- **PR #33** — quotes-list poller recovers `ai_processing` rows that have a `serverId` but no `voiceJobId` (`GET /quotes/:id`).
- **PR #35** — Quotes list live-updates on status/queue changes (`observeWithColumns`).
- **SYNC-05** — WatermelonDB pull is server-as-truth. A dirty pre-send draft whose line items disagree with the server is **not** last-write-wins: local is replaced from the server and Send is blocked behind a visible **Review before sending** prompt (`needs_review` queue marker, not dead-letter). Backend `PUT /quotes` 409 is still a status lock (`Quote cannot be updated in its current status`) plus a specific freeze message when the body tries to change line items or totals on a frozen quote. Content forks are detected client-side (hydrate + GET-before-PUT / GET-before-send vs last observed `updatedAt`).
- **Thin SYNC-06** — No `quote_snapshots` table (SMS-02/04 remain Phase 6). Frozen statuses: `sent`, `approved`, `declined`, `expired`, `failed_send`. `PUT /quotes/:id` with `lineItems` or `totalCents` returns **409** `Quote line items and totals cannot be changed after send` and does not DELETE/INSERT lines. Draft/queued statuses and `ai_failed` stay writable. GET and `PATCH /archive` stay allowed. Mobile `processQueue` skips those PUTs and parks a Sync issues row instead of retrying into dead-letter via backoff. `failed_send` is frozen for money so catalog/draft sync cannot rewrite the attempted snapshot; Phase 6 may later change status without rewriting lines.
- **HIST-05** — Quotes list swipe → confirm → soft-archive. Local `is_archived`; server `PATCH /quotes/:id/archive` (`{ archived: true }` or `{ isArchived: false }` to undo). GET `/quotes` is the active list; `GET /quotes?archived=true` is archived. Hydrate pulls both so login can restore Archived. A queued Unarchive is not overwritten. The Quotes screen has a Quotes / Archived toggle; Unarchive swipe+confirm. **Hard-delete is only for never-synced empty `draft_local` rows with no `serverId`** (UAT junk Manual Quotes). Confirm, then WatermelonDB destroy of quote + draft + pending queue rows — no server API. Anything with a `serverId` stays on Archive (hydrate would resurrect it). `processQueue` will not POST `/quotes` if the local row is already gone.
- **PR #37** — Railway `npm start` runs pending SQL migrations then the API (`docs/DEPLOY-RAILWAY.md`). Not a live demo; no `railway.toml`.
- **PR #38** — Quotes / Archived toggle; Unarchive swipe. Hydrate pulls `GET /quotes?archived=true` as well as the active list.
- **PR #39** — Hard-delete never-synced empty local drafts (`!serverId`): confirm, then destroy quote + draft + pending queue rows locally. No server delete API.
- **PR #44** — Per-contractor rate card learn on draft price confirm (`POST /rate-card`, `GET /rate-card` exact lookup).
- **P0-B** — Adhoc voice lines (non-catalog UUID) persist name/qty/unit; price attach is spoken → catalog SKU → exact rate-card → blank.
- **P0-C** — Skippable catalog seed. Signup persists hourly labor rate (integer cents) + optional markup %. Labor unit price = hours × hourly (`computed`); unknown non-labor stays blank. Never invent SKU prices.
- **Private notes (design #9)** — Contractor-only job + line notes. Persist on `quotes.private_note` / `quote_line_items.private_note` (Watermelon `quotes.private_note` + draft JSON `privateNote`). Draft/detail UI labeled internal-only. `toCustomerQuotePayload` allowlist omits them (tests guard Phase 6 PDF/SMS). Unused `drafts.notes` is not this feature.
- **Thin option groups (design §8)** — One base + one alternate per undecided item (`option_group_id` UUID + `option_role` `base|alt` on `quote_line_items`; same fields on draft JSON). Selected-for-total is `base` (swap roles to pick the other). Totals exclude `alt`. No `option_groups` table, no good/better/best packages. Alternate price is typed or left blank — never invented.

**Still open (docs, not these fixes):**

- **PR #6** — draft Phase 5 UAT runbook.
- **PR #4** — older GSD ROADMAP/STATE/PROJECT rewrite; superseded by this `CONTEXT.md` approach.

Do **not** implement Phase 6 SMS or product features unless a task explicitly asks. Railway migrate-on-boot is in `npm start`. Android EAS preview config is in-tree ([docs/EAS-ANDROID.md](docs/EAS-ANDROID.md)); do not claim a live Expo/Railway demo or run `eas login` / `eas submit` in CI.

---

## Monorepo layout

npm workspaces, two apps:

```
apps/mobile/     Expo 52, RN 0.76.5, expo-router, WatermelonDB 0.27.1, Zustand
apps/backend/    Express, raw `pg` via `query()`, pg-boss, OpenAI, R2
apps/backend/src/db/migrations/   001_foundation … 016_quote_line_item_option_group
apps/mobile/src/db/               schema v6, models, SQLiteAdapter
apps/mobile/src/sync/             enqueue + processQueue (retry/backoff, single-flight, audio parent) + login/restore hydrate (server-as-truth; SYNC-05 draft forks → needs_review; thin SYNC-06 skips money PUTs on frozen quotes)
.github/workflows/ci.yml
```

There is no root `README.md`. Native `android/` and `ios/` are gitignored (Expo prebuild locally / EAS). `apps/mobile/eas.json` is the Android internal/preview APK profile ([docs/EAS-ANDROID.md](docs/EAS-ANDROID.md)).

### Backend routes (`apps/backend/src`)

| Mount | Role |
|-------|------|
| `GET /health` | Liveness |
| `/auth` | register, login, refresh, logout (rate-limited register/login/refresh, 6 / 15 min per IP) |
| `/onboarding` | `POST /profile` (trade + hourlyRateCents + optional markupPercent, no catalog) + optional `POST /seed` |
| `/catalog` | CRUD + `PATCH /:id/archive` |
| `/quotes` | list/create/update quotes + line items + `PATCH /:id/archive` |
| `/rate-card` | P0-A learned prices: `POST /` upsert last confirmed unit price; `GET /?name&unit&trade` exact lookup (`{ entry: null }` on miss). Does not rewrite catalog or quote snapshots. |
| `/voice` | `POST /upload`, `GET /status/:jobId`, `GET /draft/:quoteId` |

Workers: `voice-processor.ts` (pg-boss queue `voice-process`) and `ai-processing-reaper.ts` (queue `ai-processing-reaper`, every minute). No Twilio, FCM, or approval-page routes. Postgres `contractors.fcm_token` is reserved for FAIL-08 / SMS-08 (COMMENT in migration `008`); unused — do not drop or implement FCM.

### Mobile screens (`apps/mobile/app`)

- `(auth)` — login, register, onboarding (trade + hourly / optional seeding / ready)
- `(app)` — quotes list (default authenticated entry after login/restore/onboarding), catalog, `voice-record`, `draft/[id]`, `quote/[id]`. No Home tab; **Log Out** is a nav-header action (A-19). `/(app)` / index redirects to Quotes.

---

## Invariants (do not break)

1. **Money is integer cents.** Columns and fields are `*_cents` / `*Cents`. UI may format dollars; storage and API stay integers.
2. **`quote_line_items` are snapshots.** Persist `name` + `unit_price_cents` on the row (optional `unit`, migration `011`). Catalog price edits must not rewrite historical quotes. Optional `catalog_item_id` (migration `004_voice.sql`, `ON DELETE SET NULL`) is provenance for AI rows — not a live price join. Adhoc voice lines have `catalog_item_id` null. Unknown prices store `0` and the draft UI flags them blank.
3. **There is no `quote_snapshots` table.** Older planning docs claimed a write-once snapshot + DB trigger. That is a **Phase 6** design (`SMS-02` / `SMS-04`), not present in migrations. Thin **SYNC-06** freezes `PUT` line-item/total writes on `sent` / `approved` / `declined` / `expired` / `failed_send` using status guards on existing `quote_line_items` snapshot rows. Do not document a snapshot table as shipped.
4. **Voice extract may return catalog IDs or adhoc name/qty/unit.** GPT maps to an active-catalog UUID when it clearly matches; otherwise it still emits the spoken line (`catalog_item_id` null). Prices are attached after extract: spoken cents if present → catalog SKU cents if mapped → `GET /rate-card` exact name+unit(+trade) → **computed labor** (hour-unit line, or synthesized Labor from `spokenHours`, times `contractors.hourly_rate_cents`) → else blank/`null` (stored as `0` on the NOT NULL snapshot). Never invent a SKU, catalog ID, trade-default, or guessed material price. `filterUuidCatalogIds` still drops non-UUID IDs before `ANY($n::uuid[])`.
5. **Confidence in the UI is tiers, never raw floats.** `confidenceTier()`: `≥0.85` clean (no badge), `0.60–0.84` “Review” (amber), `<0.60` “Needs Input” (red, auto-scroll). `LineItemRow` takes `'review' | 'needs_input'`.
6. **Offline-first.** Quotes, catalog, drafts, and `sync_queue_items` live in WatermelonDB. Retrofitting online-first is a rewrite.
7. **Backend ESM.** `apps/backend/package.json` has `"type": "module"`; `tsconfig` is NodeNext. Relative imports **must** use `.js` extensions (`from "./routes/auth.js"`).
8. **WatermelonDB adapter:** `newArchEnabled: false` in `apps/mobile/app.config.ts`; `SQLiteAdapter({ jsi: false })` in `apps/mobile/src/db/index.ts`. Do not flip these without a native rebuild and device verification. (An early decision to enable JSI was reversed for RN 0.76.) There is no Expo `web` target — product is mobile-first and the API has no CORS.
9. **SQL is parameterized and tenant-scoped.** Catalog/quote/rate-card lookups always include `contractor_id` from the JWT.
10. **`failed_send` ≠ `ai_failed`.** `ai_failed` is the voice pipeline; `failed_send` is reserved for SMS (Phase 6).
11. **Audio PII:** delete from R2 **after** Whisper + GPT + DB commit succeed, not immediately after transcription. Delete failures after success are logged; they must not fail the job (avoids duplicate line items on retry).
12. **Rate card does not invent prices.** `rate_card_entries` stores last typed/confirmed unit prices keyed by exact normalized name + unit + optional trade. Voice attach uses exact `GET /rate-card` only after spoken/catalog miss. Catalog SKU edits and quote snapshots stay independent. GPT must not read the rate card to guess prices.
13. **Private notes never hit the customer PDF / SMS / approval page.** Job notes are `quotes.private_note`; line notes are `quote_line_items.private_note` (and `privateNote` in draft JSON). Contractor GET/PUT/hydrate may include them. Phase 6 send/PDF **must** use `toCustomerQuotePayload` (allowlist). Do not spread a quote row into a customer payload. Unused Watermelon `drafts.notes` is a leftover — do not store private notes there.

---

## Environment

### Database

- Backend reads `DATABASE_URL` (`apps/backend/.env`).
- `.env.example` shows Postgres on **5432**.
- Local convention documented in this repo: Docker container `quotesnap-db` is published on **5433** so it does not collide with a host Postgres on 5432. Match the port in the `.env` you actually use.
- Start DB before the API: `docker start quotesnap-db`
- Migrations: `cd apps/backend && npm run migrate` (files `001`…`016`). Safe to re-run: `_migrations` skips applied files.
- **Railway / production boot:** repo-root `npm start` is `node dist/db/migrate.js && node dist/index.js` (after `npm run build`). Operators should leave **Start Command** empty or set `npm start`. Do not start with only `node dist/index.js` — `quotes.is_archived` (009) and later files will not land. Details: [docs/DEPLOY-RAILWAY.md](docs/DEPLOY-RAILWAY.md).

### Backend

```bash
cd apps/backend && npm run dev    # tsx watch, default PORT=3000
```

`app.listen(PORT)` (no explicit host). For a physical phone, Windows/macOS firewall must allow inbound TCP 3000. Required env: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `OPENAI_API_KEY`, `R2_*` (see `apps/backend/.env.example`). Optional: `WHISPER_LANGUAGE` — default **`en`**; set `he` for Hebrew; empty string opts into Whisper auto-detect. Optional: `AI_PROCESSING_TIMEOUT_MS` — default **900000** (15 minutes); commented in `.env.example`. `JWT_REFRESH_SECRET` is unused (refresh tokens are opaque SHA-256 hashes, not JWTs).

Auth: 15-minute JWT access tokens; 30-day refresh tokens stored as SHA-256 hashes; rotation on refresh. Login uses **one** identifier (email wins if both present) — never `WHERE email = $1 OR phone = $2 LIMIT 1`.

### Mobile API URL (physical device)

`apps/mobile/src/api/client.ts` and `voice.ts` read `Constants.expoConfig.extra.apiUrl`, which comes from `EXPO_PUBLIC_API_URL` in `apps/mobile/app.config.ts`.

**Fallback is `http://10.0.2.2:3000` (Android emulator only).** A physical phone cannot reach `10.0.2.2`. For USB + Metro, set `EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000` in a local `apps/mobile/.env` (gitignored). For a shareable APK (no USB, no Metro), set `EXPO_PUBLIC_API_URL=https://<your-railway-host>` on the EAS **preview** environment — [docs/EAS-ANDROID.md](docs/EAS-ANDROID.md). Do not commit a home LAN IP.

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

Root `package.json` has no `test` script; CI invokes workspaces. On current `master`, backend tests cover login-lookup, voice-validation (catalog SKUs + adhoc name/qty/unit, UUID filter, spoken vs rate-card vs computed labor vs blank attach), whisper-language, the ai-processing reaper, quotes list payload nesting (`voiceJobId` + line items), voice upload quote reuse vs create, quote soft-archive (`PATCH /quotes/:id/archive` both directions, active vs `?archived=true` list SQL), production start chaining SQL migrate before listen, rate-card upsert/exact lookup (`010_rate_card_entries`), quote snapshot `unit` (`011_quote_line_item_unit`), skippable onboarding profile (`012_contractor_hourly`, no catalog insert), labor hours × hourly compute, thin SYNC-06 freeze of line-item/total PUT on sent and sibling statuses, private notes persist (`014_private_notes`) plus `toCustomerQuotePayload` omission, price_source flags (`015`), and thin option groups (`016`: pair persist + totals exclude `alt`). Mobile tests cover confidence, line-items (including null catalog/price adhoc parse, line `privateNote`, and base+alt option groups with selected-only totals), quote-validation, sync retry/backoff, single-flight, audio parent, NetInfo, `processQueue` (including quote archive/unarchive PATCH, skipping POST when a local quote was hard-deleted, rate-card upsert, onboarding profile without seed, skipping money PUTs on frozen quotes, and forwarding line `privateNote` / option group fields on contractor draft PUT), auth 401 handling, login/restore catalog+quote hydrate (active + archived pulls; Unarchive is not overwritten; frozen quotes take the server snapshot even when a draft PUT is queued; private notes and option pairs round-trip), offline onboarding seed enqueue / 409 de-dupe, skippable seed (trade + hourly, itemCount 0), voice-upload retry passing `quoteServerId`, FAIL-03 offline voice enqueue (stays pending, not `ai_failed`), FAIL-07 crash-resume detection/routing (`resume_checkpoints`, “Resume where you left off”), quotes-list `ai_processing` poll recovery (`serverId` without `voiceJobId`), SYNC-05 draft forks (hydrate + queue GET-before-PUT + `needs_review`), quote archive/unarchive copy, hard-delete of never-synced empty local drafts (`!serverId`), draft price-edit rate-card learn payload (exact name+unit, no invented unit), and customer-payload allowlist (private notes never in the JSON; unselected alts omitted).

---

## Known gaps (still true in tree — verify before “fixing”)

These are **on `master` after PRs #8, #9, #12, #13, #31, #32, #33, #35, #36, #37, #38, #39, #44, #45, #46, #47, #48, #49, #50, #51, #52, and #53**. Do not re-implement retry/single-flight, the reaper, the auth 401 interceptor, login/restore hydrate, dead-letter UI, SYNC-05 draft-conflict handling, thin SYNC-06 post-send money freeze, quotes-list live observe, quote soft-archive / Archived+Unarchive, Railway migrate-on-boot, hard-delete of never-synced empty local drafts, rate-card learn (P0-A), adhoc voice lines + exact price attach (P0-B), skippable seed + hourly labor (P0-C), FAIL-03 offline voice queue, FAIL-04/05 voice retry, FAIL-07 crash resume, private notes, draft price_source flags, or thin option groups.

- **Phase 5 UAT** not signed off on a physical Android device.
- **Send Quote** sets `draft_queued` and enqueues a sync payload; no SMS (`SMS-01`).
- **Mic denied** shows an in-app Alert + Settings link (`voice-record.tsx`). **FAIL-03** queues the local recording when upload/NetInfo is down (Quotes shows **Queued** / will retry; no mid-flow Alert). **FAIL-04** retries the original `documentDirectory` recording on the same quote; **FAIL-05** keeps a flagged partial draft plus Add items. **FAIL-07** writes a local `resume_checkpoints` row while recording or editing a draft and prompts **Resume where you left off** after auth restore. Remaining **`FAIL-*`** (SMS, FCM, FAIL-01/02) are incomplete. `WORKFLOW-failure-edge-cases.md` is referenced by `FAIL-01` and **is not in the repo**.

When you mention defects, prefer what is in the tree on `master` over open-PR speculation.

---

## Planning docs — what to trust

| Path | Trust |
|------|--------|
| `CONTEXT.md` (this file) | Current agent briefing |
| `docs/DEPLOY-RAILWAY.md` | Railway Start Command: `npm start` runs SQL migrations then the API |
| `docs/EAS-ANDROID.md` | Android internal/preview EAS APK (no USB/Metro); `EXPO_PUBLIC_API_URL` for Railway HTTPS |
| `.planning/REQUIREMENTS.md` | Requirement IDs and checkbox intent |
| `.planning/phases/**/SUMMARY.md` | Historical “what landed in that plan” |
| `.planning/PHYSICAL-DEVICE-TESTING.md` | Device UAT procedure (fix LAN URL there if you change it) |
| `.planning/STATE.md`, `ROADMAP.md`, `PROJECT.md` | Stubs pointing here — not a second status source |
| `.planning/config.json` | Removed (GSD workflow junk) |
| `.claude/next-session-prompt.md` | Removed (pointed at already-merged `feat/p5-04-pipeline-closure`) |

If STATE/ROADMAP/PROJECT and this file ever disagree, **this file wins**, then the tree.
