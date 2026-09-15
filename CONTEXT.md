# QuoteSnap — agent context

**This is the canonical briefing for Cursor/cloud agents.** Prefer it over `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`, and any `.claude/` session prompt.

Requirement IDs (`AUTH-01`, `VOICE-06`, `SMS-03`, …) live in [`.planning/REQUIREMENTS.md`](.planning/REQUIREMENTS.md). Keep those IDs; do not invent a parallel vocabulary.

Phase PLAN / SUMMARY / RESEARCH files under `.planning/phases/` are **historical**. They describe how code was built, not whether it is current.

---

## Product

Mobile-first quoting for solo trade contractors (plumbing, electrical, HVAC). Contractor describes a job by voice; Whisper + GPT-4o extract line items (catalog UUID when mapped, otherwise adhoc name/qty/unit) with **no AI-invented prices**; contractor reviews/edits the draft. SMS send + customer approval is **Phase 6 and is not implemented**.

Core loop on `master`: register/login → trade + hourly (markup optional; catalog seed skippable) → catalog CRUD if they want it → record voice or create a manual draft → review line items → archive unwanted quotes from the list (hard-delete only never-synced empty local drafts) → **Share quote** builds a customer PDF (or HTML fallback) from `toCustomerQuotePayload`, opens the OS share sheet, and marks an eligible draft **`sent`** (with `sent_at`; phone optional) so thin SYNC-06 freeze applies → “Send” currently only marks the quote `draft_queued` locally (no Twilio).

---

## Status on `master` (2026-09-15)

Re-check GitHub before treating anything else as landed. This briefing includes merged PRs through **#72**. Overnight 2026-09-14/15 on `master` (through **#62**): P0 rate card / adhoc voice / skippable seed + hourly, thin SYNC-06, FAIL-03/04/05/07, private notes, price_source, option groups, client sentence, rooms, photos, PDF share, paste→rate card, markup compute, My rates list, mark-sent on share. Day session 2026-09-15: **#63** draft Import from photo stub (blank price; never invents), **#64** My rates `q`/`search` list filter (voice attach stays exact), **#65** FAIL-01 map, **#66** P0 pricing / `price_source` attach tests, **#67** share cancel / empty-quote / mark-sent edges, **#68** client sentence as PDF Assumptions (empty omits; never invents copy), **#69** draft cost×markup keypad (never invents price), **#70** option groups empty/selection edges, **#71** docs sync through #70, **#72** rooms empty/delete/ungroup edges. **FAIL-01** (this map) and **FAIL-02** (mic Alert already in `voice-record.tsx`) are documented in [docs/WORKFLOW-failure-edge-cases.md](docs/WORKFLOW-failure-edge-cases.md). **Not** in that wave: Phase 6 SMS/Twilio/approval page, GPT-4o Vision (`PHOTO-01`), Hebrew product copy, a live EAS/Railway demo, or physical-device UAT. Draft **Import from photo** is a stub on the existing photo-on-line path (blank price; filename / “Imported item”).

| Phase | In code? | Honest status |
|-------|----------|----------------|
| 1 Foundation (auth + WatermelonDB) | Yes | Shipped. PRs #1 (rate-limit / pool) and #2 (refresh coalesce) merged. |
| 2 Onboarding | Yes | Shipped. Catalog seed is **optional** (`POST /onboarding/profile` persists trade + hourly without catalog). Optional **import old quotes** pastes (or later OCR) line names/units/prices into the rate card; skip never blocks first quote. `ONBD-03` (90s on 1-bar LTE) and `ONBD-04` (offline seed) not human-validated. |
| 3 Catalog management | Yes | Shipped (`CAT-01`…`CAT-06`). |
| 4 Quote review + history | Yes | Shipped (`REVIEW-*`, `HIST-01`…`HIST-05`). `HIST-05` is quote soft-archive (catalog analog) plus an Archived list with Unarchive. Never-synced empty local drafts (`!serverId`) can be hard-deleted from the device. |
| 5 Voice-to-quote | Yes | **Code-complete.** All four plans have SUMMARY files. Physical Android UAT is still open (see `.planning/PHYSICAL-DEVICE-TESTING.md` and `05-HUMAN-UAT.md`). Stale `ai_processing` rows are reaped to `ai_failed` (PR #9). |
| 6 SMS + customer approval | No | SMS/Twilio/`SMS-01`…`SMS-10` not started. **Thin customer PDF + OS share** is shipped (contractor Share quote; not an approval page). Successful share marks eligible drafts `sent` (phone optional; no Twilio). |
| 7 Sync hardening + 16 failure scenarios | Partial | **`SYNC-03`** retry/backoff then `dead_letter`. **`SYNC-04`** dead-letter UI. **`SYNC-05`** server-as-truth + “Review before sending” on pre-send draft forks. **Thin `SYNC-06`**: `sent` / `approved` / `declined` / `expired` / `failed_send` cannot have line items or totals rewritten by PUT/sync. **`FAIL-01`** map: [docs/WORKFLOW-failure-edge-cases.md](docs/WORKFLOW-failure-edge-cases.md). **`FAIL-02`** mic denied → Alert + Settings. **`FAIL-03`** offline voice upload stays queued (no mid-flow error). **`FAIL-04`/`FAIL-05`** voice retry + mapping fallback. **`FAIL-07`** crash/kill resume from local SQLite with a “Resume where you left off” prompt. Remaining **`FAIL-06`/`FAIL-08`** (SMS, FCM) are **not** done. |
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
- **P0-B** — Adhoc voice lines (non-catalog UUID) persist name/qty/unit; price attach is spoken sell → catalog SKU → exact rate-card → computed labor (hours × hourly) → computed material (cost × markup) → blank. Never invent a SKU price.
- **P0-C** — Skippable catalog seed. Signup persists hourly labor rate (integer cents) + optional markup % on `contractors.markup_percent` (API `markupPercent`; not a separate `material_markup_percent` column). Labor unit price = hours × hourly (`computed`). Material sell = spoken/typed cost × (1 + markup/100) (`computed`) when both are known. Unknown stays blank. Never invent SKU prices.
- **FAIL-01 / FAIL-02 / FAIL-03 / FAIL-04 / FAIL-05 / FAIL-07** — [docs/WORKFLOW-failure-edge-cases.md](docs/WORKFLOW-failure-edge-cases.md) lists all 16 scenarios (detection, UX, recovery, status). Mic denied is an in-app Alert + Settings (`mic-permission.ts`). Offline voice upload stays queued (no mid-flow error). Whisper failure retries the original `documentDirectory` recording on the same quote. GPT mapping failure keeps a flagged partial draft plus Add items. Crash/kill writes a local `resume_checkpoints` row and prompts **Resume where you left off**. Remaining **FAIL-06 / FAIL-08** (SMS, FCM) are not done.
- **Private notes (design #9)** — Contractor-only job + line notes. Persist on `quotes.private_note` / `quote_line_items.private_note` (Watermelon `quotes.private_note` + draft JSON `privateNote`). Draft/detail UI labeled internal-only. `toCustomerQuotePayload` allowlist omits them (tests guard Phase 6 PDF/SMS). Unused `drafts.notes` is not this feature.
- **Draft price_source flags (design §7, PR #50)** — Persist provenance on `quote_line_items.price_source`: `spoken` | `catalog` | `learned` | `computed` | `unknown` | `known` (contractor-typed on review). Draft UI maps catalog/learned/known → Known (quiet), spoken → “you said”, computed → “from your rate”; blank cents are always Unknown. Source is provenance only — never invents a price. `imported` is a rate-card `source`, not a line `price_source`.
- **Thin option groups (design §8, PR #70 polish)** — One base + one alternate per undecided item (`option_group_id` UUID + `option_role` `base|alt` on `quote_line_items`; same fields on draft JSON). Selected-for-total is `base` (swap roles to pick the other). Totals exclude `alt` and use stored cents on the selected line plus ungrouped. Empty groups, leftover singles, and out-of-range **Use for total** are no-ops; incomplete pairs dissolve to ungrouped so **Add alternate** still works. No `option_groups` table, no good/better/best packages. Alternate price is typed or left blank — never invented.
- **Client sentence (design §8, PR #52, PDF polish #68)** — Customer-facing assumption line on `quotes.client_sentence` (API `clientSentence`; max 2000). Voice may join extract `assumptions[]` when present; empty extract does not invent copy. Draft can edit it (placeholder **Leave blank if none** is hint-only). `toCustomerQuotePayload` normalizes empty/whitespace to `null`. Share HTML/PDF shows a labeled **Assumptions** block when present; empty omits the whole block (no placeholder copy). Private notes stay out.
- **Thin rooms/zones (design §6.1 / §8, PR #72 polish)** — Default capture grouping is rooms, not one blob. `quotes.rooms` JSONB `[{id, name, privateNote?}]` plus nullable `quote_line_items.room_id` (and draft JSON `roomId`). Null room = ungrouped / single-memo. Empty room list and a single ungrouped memo stay valid; stale line ids sanitize off without inventing a price. Draft lists rooms, adds a room, groups lines; **Remove** confirms then `removeRoom` ungroups lines (and room photos) without repricing — deleting the last room returns the flat single-memo list. `renameRoom` changes the label in place (same id) and does not stamp a spoken `roomName` onto lines. Voice extract may set a spoken `room` name (optional — never invented). Totals unchanged. No `quote_rooms` table. Room private notes are contractor-only; customer allowlist may include `roomName` on lines (`null` for ungrouped).
- **Thin photo-on-line (design §6.1 / §8)** — Stills attach to the quote, a room, and/or a line so later nobody says “this isn’t what we meant.” No media tables existed before `019_quote_attachments.sql` (voice audio is R2-then-delete, not a photo store). Local-first: copy into `documentDirectory/photos/{quoteId}/`, persist metadata on Watermelon `quotes.photos_json`, queue `entityType: 'photo'` until the parent quote has a `serverId`, then `POST /quotes/:id/photos` → private R2 key `photos/{contractorId}/{id}` (not a public URL) → stamp `serverId`. GET list/detail includes contractor-only `{id, clientId, mime, roomId, lineClientId, uploaded}` — never `r2_key`. Authenticated `GET /quotes/:id/photos/:photoId` streams bytes (`Cache-Control: private`). `toCustomerQuotePayload` omits photos. Draft **Import from photo** reuses this attachment path: camera/library → stored still + adhoc line with **blank price** (`priceSource=unknown`) and a name hint from caption/OCR text, filename stem, or “Imported item”. Vision (`PHOTO-01`) is not wired — `captionFromStill` is a stub (`TODO(PHOTO-01)`); it never parses `$` / cents from pixels or OCR into `unitPriceCents`. Video and new-device thumbnail download into the `Image` view (auth header) are out of this slice — missing local URI shows **On server**. Camera/library needs a native rebuild for `expo-image-picker`. Never invents prices.
- **Thin customer PDF + share (design §6.2 / §8)** — Draft and quote-detail **Share quote** maps `toCustomerQuotePayload` (client sentence in as **Assumptions** when present; private notes / unselected alts / photos out; rooms grouped; blanks stay blank) to HTML, then `expo-print` HTML→PDF (shareable `.html` fallback) and `expo-sharing` OS share sheet. Contractor `displayName` + trade when present. Does not invent prices. After a successful share, eligible drafts (`draft_local` / `draft_queued` / `ai_failed`) PUT `status: sent` and set `sent_at` — **customer phone is not required** and is not invented. Cancel, share-API fail, or an empty quote (no customer-facing lines; copy **Add at least one item before sharing**) skip mark-sent. Already-sent re-share still opens the sheet; mark-sent is a no-op (no `sent_at` rewrite). Thin SYNC-06 freeze then applies. Not Twilio, not a hosted approval page, not payment. Native rebuild needed for `expo-print` / `expo-sharing` (same as image-picker — not Expo Go). PDF visual polish / letterhead deferred.
- **PR #61** — Mark-sent after share (the transition above). In-app **Send** still only queues `draft_queued` (no Twilio). PUT body is `{ status: 'sent' }` — tests assert it does not SET `customer_phone`.
- **Thin old-quote import (design §5)** — Optional onboarding + Catalog **Import old quotes**. Paste priced lines (fixture-tested parser) → upsert `rate_card_entries` with `source=imported` via existing `POST /rate-card` / `POST /rate-card/import`. Pick up to 3 photos/screenshots as a hook; **image/PDF OCR is a stub** (calm paste hint, never blocks quoting). Does not invent prices, does not write catalog SKUs, does not replace P0-C skip.
- **Thin rate card list (design §10)** — Rate card stays a byproduct, not onboarding. `GET /rate-card` without `name` lists the contractor’s entries (`{ entries, limit, offset, total }`; `name`+`unit` is still exact lookup). Optional `q` or `search` filters that list by normalized-name substring (optional `unit`); this is My rates UX only — voice attach still uses exact `GET /rate-card?name&unit`. Catalog-adjacent **My rates** shows last price, unit, use count, and stored `source` (including `imported`), with a search field that calls list with `q`. Tap edits price via existing `POST /rate-card` upsert (does not invent rows). Optional swipe delete is `DELETE /rate-card/:id`. No embeddings/fuzzy search.
- **Material markup compute (design §7 Computed, PR #69 keypad)** — Voice extract splits spoken **sell** (`spokenUnitPriceCents`) from spoken/typed **cost** (`spokenMaterialCostCents`). After spoken/catalog/learned, labor stays hours × `hourly_rate_cents`; non-labor with cost + `markup_percent` fills `Math.round(cost × (1 + markup/100))` with `price_source=computed` (draft “from your rate”). Spoken sell still wins. Markup without a cost does not invent a price. Cost without markup is not a sell price. Draft **Edit price** can type cost and markup: displayed unit price live-recalculates; missing either stays blank/`unknown`. Manual unit-price override after compute is `known` (not computed) and does not invent dollars. Labor hour lines skip material markup.
- **PR #63** — Draft **Import from photo** stub on the existing photo-on-line path: camera/library still + adhoc line, **blank price**, name from filename stem or “Imported item”. Never parses `$` / OCR cents. Not `PHOTO-01` Vision (`captionFromStill` is `TODO(PHOTO-01)`).
- **PR #64** — My rates list filter: `GET /rate-card` list mode accepts `q` or `search` (normalized-name substring; optional `unit`). Voice attach still uses exact `GET /rate-card?name&unit`. No embeddings.
- **PR #65** — FAIL-01 scenario map in [docs/WORKFLOW-failure-edge-cases.md](docs/WORKFLOW-failure-edge-cases.md) (16 scenarios; FAIL-06/08 defined only, not implemented).
- **PR #66** — P0 pricing / `price_source` attach tests (spoken → learned exact → labor×hourly → blank; never invent; `priceSource` dropped from customer payload).
- **PR #67** — Share cancel / share-API fail skip mark-sent; empty quote blocked (`Add at least one item before sharing`); already-sent re-share is a no-op.
- **PR #68** — Client sentence is the PDF **Assumptions** block; empty/whitespace → `null` (block omitted; never invents scope copy).
- **PR #69** — Draft cost×markup keypad polish (live compute; missing either stays blank; manual unit-price after compute is `known`).
- **PR #70** — Option groups empty/selection polish (incomplete pairs dissolve; **Use for total** no-ops on empty/orphan; totals follow selected stored cents only).
- **PR #71** — Docs-only CONTEXT sync through merged #63–#70. No product code.
- **PR #72** — Rooms empty/delete/ungroup polish (empty list / last-room delete → single-memo; **Remove** ungroups without repricing; rename keeps id; stale ids sanitize off; customer `roomName` null for ungrouped).

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
apps/backend/src/db/migrations/   001_foundation … 020_rate_card_imported_source
apps/mobile/src/db/               schema v8, models, SQLiteAdapter
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
| `/quotes` | list/create/update quotes + line items + `PATCH /:id/archive` + thin photo-on-line `POST /:id/photos` and authenticated `GET /:id/photos/:photoId` |
| `/rate-card` | P0-A learned prices: `POST /` upsert last confirmed unit price; `GET /?name&unit&trade` exact lookup (`{ entry: null }` on miss); `GET /` (no `name`) paginated contractor list `{ entries, limit, offset, total }` with optional `q`/`search` name substring and optional `unit`; `DELETE /:id` tenant-scoped remove; `POST /import` parses pasted old-quote text (and text documents) into `source=imported` upserts. Image/PDF slots return a paste-needed stub. Does not rewrite catalog or quote snapshots. |
| `/voice` | `POST /upload`, `GET /status/:jobId`, `GET /draft/:quoteId` |

Workers: `voice-processor.ts` (pg-boss queue `voice-process`) and `ai-processing-reaper.ts` (queue `ai-processing-reaper`, every minute). No Twilio, FCM, or approval-page routes. Postgres `contractors.fcm_token` is reserved for FAIL-08 / SMS-08 (COMMENT in migration `008`); unused — do not drop or implement FCM.

### Mobile screens (`apps/mobile/app`)

- `(auth)` — login, register, onboarding (trade + hourly / optional seeding / optional import old quotes / ready)
- `(app)` — quotes list (default authenticated entry after login/restore/onboarding), catalog, `my-rates`, `import-quotes`, `voice-record`, `draft/[id]`, `quote/[id]`. Draft has **Import from photo** (camera/library stub on photo-on-line; blank price). Draft and quote detail have **Share quote** (OS share sheet; successful share marks eligible drafts `sent`). No Home tab; **Log Out** is a nav-header action (A-19). `/(app)` / index redirects to Quotes.

---

## Invariants (do not break)

1. **Money is integer cents.** Columns and fields are `*_cents` / `*Cents`. UI may format dollars; storage and API stay integers.
2. **`quote_line_items` are snapshots.** Persist `name` + `unit_price_cents` on the row (optional `unit`, migration `011`). Catalog price edits must not rewrite historical quotes. Optional `catalog_item_id` (migration `004_voice.sql`, `ON DELETE SET NULL`) is provenance for AI rows — not a live price join. Adhoc voice lines have `catalog_item_id` null. Unknown prices store `0` and the draft UI flags them blank.
3. **There is no `quote_snapshots` table.** Older planning docs claimed a write-once snapshot + DB trigger. That is a **Phase 6** design (`SMS-02` / `SMS-04`), not present in migrations. Thin **SYNC-06** freezes `PUT` line-item/total writes on `sent` / `approved` / `declined` / `expired` / `failed_send` using status guards on existing `quote_line_items` snapshot rows. Do not document a snapshot table as shipped.
4. **Voice extract may return catalog IDs or adhoc name/qty/unit.** GPT maps to an active-catalog UUID when it clearly matches; otherwise it still emits the spoken line (`catalog_item_id` null). Prices are attached after extract: spoken **sell** cents if present → catalog SKU cents if mapped → `GET /rate-card` exact name+unit(+trade) → **computed labor** (hour-unit line, or synthesized Labor from `spokenHours`, times `contractors.hourly_rate_cents`) → **computed material** (`spokenMaterialCostCents` × (1 + `contractors.markup_percent`/100), integer cents, only when both cost and markup are known) → else blank/`null` (stored as `0` on the NOT NULL snapshot). Never invent a SKU, catalog ID, trade-default, or guessed material price. Markup alone is not a price. A spoken cost is not a sell price unless markup is known and earlier attach steps missed. `filterUuidCatalogIds` still drops non-UUID IDs before `ANY($n::uuid[])`.
5. **Confidence in the UI is tiers, never raw floats.** `confidenceTier()`: `≥0.85` clean (no badge), `0.60–0.84` “Review” (amber), `<0.60` “Needs Input” (red, auto-scroll). `LineItemRow` takes `'review' | 'needs_input'`.
6. **Offline-first.** Quotes, catalog, drafts, and `sync_queue_items` live in WatermelonDB. Retrofitting online-first is a rewrite.
7. **Backend ESM.** `apps/backend/package.json` has `"type": "module"`; `tsconfig` is NodeNext. Relative imports **must** use `.js` extensions (`from "./routes/auth.js"`).
8. **WatermelonDB adapter:** `newArchEnabled: false` in `apps/mobile/app.config.ts`; `SQLiteAdapter({ jsi: false })` in `apps/mobile/src/db/index.ts`. Do not flip these without a native rebuild and device verification. (An early decision to enable JSI was reversed for RN 0.76.) There is no Expo `web` target — product is mobile-first and the API has no CORS.
9. **SQL is parameterized and tenant-scoped.** Catalog/quote/rate-card lookups always include `contractor_id` from the JWT.
10. **`failed_send` ≠ `ai_failed`.** `ai_failed` is the voice pipeline; `failed_send` is reserved for SMS (Phase 6).
11. **Audio PII:** delete from R2 **after** Whisper + GPT + DB commit succeed, not immediately after transcription. Delete failures after success are logged; they must not fail the job (avoids duplicate line items on retry).
12. **Rate card does not invent prices.** `rate_card_entries` stores last typed/confirmed/imported unit prices keyed by exact normalized name + unit + optional trade. Voice attach uses exact `GET /rate-card` only after spoken/catalog miss. Catalog SKU edits and quote snapshots stay independent. GPT must not read the rate card to guess prices. Old-quote import only upserts prices literally present on the pasted lines (`source=imported`); it does not OCR-guess from photos in this slice.
13. **Private notes never hit the customer PDF / SMS / approval page.** Job notes are `quotes.private_note`; line notes are `quote_line_items.private_note` (and `privateNote` in draft JSON). Contractor GET/PUT/hydrate may include them. Phase 6 send/PDF **must** use `toCustomerQuotePayload` (allowlist). Do not spread a quote row into a customer payload. Unused Watermelon `drafts.notes` is a leftover — do not store private notes there.
14. **Photos are job evidence, not public.** `quote_attachments` + private R2. Never put photo bytes, `r2_key`, or local URIs in `toCustomerQuotePayload`. Do not serve a public CDN URL.
15. **Share-mark-sent is not SMS.** After a successful customer PDF/HTML share, eligible drafts (`draft_local` / `draft_queued` / `ai_failed`) may PUT `status: sent` and set `sent_at` so thin SYNC-06 freeze applies. Do **not** invent `customer_phone`. Cancel, share-API fail, or an empty quote (no customer-facing lines) skip mark-sent. Already-sent re-share is a no-op (sheet may still open). The in-app **Send** button still only queues `draft_queued` — no Twilio, no approval page (`SMS-01`…`SMS-10` remain Phase 6).

---

## Environment

### Database

- Backend reads `DATABASE_URL` (`apps/backend/.env`).
- `.env.example` shows Postgres on **5432**.
- Local convention documented in this repo: Docker container `quotesnap-db` is published on **5433** so it does not collide with a host Postgres on 5432. Match the port in the `.env` you actually use.
- Start DB before the API: `docker start quotesnap-db`
- Migrations: `cd apps/backend && npm run migrate` (files `001`…`020`). Safe to re-run: `_migrations` skips applied files.
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

Root `package.json` has no `test` script; CI invokes workspaces. On current `master`, backend tests cover login-lookup, voice-validation (catalog SKUs + adhoc name/qty/unit, UUID filter, spoken vs rate-card vs computed labor vs computed material cost×markup vs blank attach, optional spoken room name), whisper-language, the ai-processing reaper, quotes list payload nesting (`voiceJobId` + line items), voice upload quote reuse vs create, quote soft-archive (`PATCH /quotes/:id/archive` both directions, active vs `?archived=true` list SQL), production start chaining SQL migrate before listen, rate-card upsert/exact lookup (`010_rate_card_entries`), rate-card contractor list + pagination + delete (`GET /rate-card` without `name`; `DELETE /:id`) plus optional `q`/`search` normalized-name substring and unit filter (list UX only; voice attach stays exact), quote snapshot `unit` (`011_quote_line_item_unit`), skippable onboarding profile (`012_contractor_hourly`, no catalog insert), labor hours × hourly compute, material cost × signup markup compute, thin SYNC-06 freeze of line-item/total PUT on sent and sibling statuses, PUT `status: sent` after share without requiring customerPhone (already-sent is a no-op 200), private notes persist (`014_private_notes`) plus `toCustomerQuotePayload` omission, price_source flags (`015`), thin option groups (`016`: pair persist + totals exclude `alt`; empty/incomplete groups are no-ops), client sentence (`017`), FAIL-07 resume checkpoints, thin rooms/zones (`018`: rooms JSON + line `room_id`, totals unchanged, empty/delete/ungroup edges, customer `roomName` without room private notes; ungrouped `roomName` null), thin photo-on-line (`019`: `quote_attachments`, private R2 upload fields, customer payload omits photos/`r2_key`; draft Import from photo stub: filename/“Imported item”, blank price, never OCR cents), and old-quote import parse/mapper (`020_rate_card_imported_source`, fixture text → `source=imported` upsert; image/PDF extract is a paste stub). Mobile tests cover confidence, line-items (including null catalog/price adhoc parse, line `privateNote`, base+alt option groups with selected-only totals, line `roomId` plus rooms empty/delete/ungroup (last room → single-memo; Remove ungroups without repricing), and line `clientId` for photos, photo→line import stub that never invents a price), quote-validation, sync retry/backoff, single-flight, audio parent, NetInfo, `processQueue` (including quote archive/unarchive PATCH, skipping POST when a local quote was hard-deleted, rate-card upsert including `source=imported`, rate-card list-edit upsert and delete, onboarding profile without seed, skipping money PUTs on frozen quotes, forwarding line `privateNote` / option group / room / clientId fields on contractor draft PUT, and photo upload after the parent quote has a `serverId`), auth 401 handling, login/restore catalog+quote hydrate (active + archived pulls; Unarchive is not overwritten; frozen quotes take the server snapshot even when a draft PUT is queued; private notes, option pairs, rooms, and photo metadata round-trip), offline onboarding seed enqueue / 409 de-dupe, skippable seed (trade + hourly, itemCount 0), optional import-quotes routing that does not replace Start quoting, My rates Catalog-adjacent list (price/unit/use count/source; edit keeps name+unit; no invented rows; list path `q` substring without sending `name`), voice-upload retry passing `quoteServerId`, FAIL-03 offline voice enqueue (stays pending, not `ai_failed`), FAIL-02 mic-denied Alert copy (`mic-permission.ts`), FAIL-07 crash-resume detection/routing (`resume_checkpoints`, “Resume where you left off”), quotes-list `ai_processing` poll recovery (`serverId` without `voiceJobId`), SYNC-05 draft forks (hydrate + queue GET-before-PUT + `needs_review`), quote archive/unarchive copy, hard-delete of never-synced empty local drafts (`!serverId`), draft price-edit rate-card learn payload (exact name+unit, no invented unit), draft cost × markup keypad (compute sell from both inputs; missing cost or markup stays blank/unknown; manual unit-price edit after compute is `known`), old-quote paste parser/mapper (fixture text, no binaries in git; photo picker capped at 3 with OCR stub), customer-payload allowlist (private notes never in the JSON; unselected alts omitted; room name included when present, null for ungrouped, room private notes omitted; photos / local URIs / r2 keys omitted), and customer document mapper + share helper (HTML/text from the allowlist; client sentence as **Assumptions** when present, empty omitted; private notes/alts/photos absent from the file bytes; blanks stay blank; print-to-PDF with HTML fallback; no binary PDF snapshots in git), and mark-quote-sent after share (draft → `sent` + `sent_at`; cancel / empty-quote / share-API fail skip mark-sent; already-sent no-op; PUT payload has no invented phone).

---

## Known gaps (still true in tree — verify before “fixing”)

These are **on `master` after PRs #8, #9, #12, #13, #31, #32, #33, #35, #36, #37, #38, #39, #44, #45, #46, #47, #48, #49, #50, #51, #52, #53, #54, #55, #56, #57, #58, #59, #60, #61, #62, #63, #64, #65, #66, #67, #68, #69, #70, #71, and #72**. Do not re-implement retry/single-flight, the reaper, the auth 401 interceptor, login/restore hydrate, dead-letter UI, SYNC-05 draft-conflict handling, thin SYNC-06 post-send money freeze, quotes-list live observe, quote soft-archive / Archived+Unarchive, Railway migrate-on-boot, hard-delete of never-synced empty local drafts, rate-card learn (P0-A), adhoc voice lines + exact price attach (P0-B), skippable seed + hourly labor (P0-C), material cost × markup compute (including draft keypad), FAIL-01 scenario map, FAIL-02 mic prompt, FAIL-03 offline voice queue, FAIL-04/05 voice retry, FAIL-07 crash resume, private notes, draft price_source flags, thin option groups (including empty/selection edges), client sentence (including PDF Assumptions empty-omit), thin rooms/zones (including empty/delete/ungroup edges), thin photo-on-line plus draft Import from photo stub (blank price; not PHOTO-01 Vision), thin customer PDF + OS share, mark-quote-sent after share (cancel / empty-quote skip; already-sent no-op), thin old-quote paste import into the rate card, the thin My rates list (paginated `GET /rate-card`, price edit via upsert, optional delete), or My rates `q` substring filter (list UX; voice attach stays exact `name`+`unit`).

- **Phase 5 UAT** not signed off on a physical Android device.
- **Send Quote** sets `draft_queued` and enqueues a sync payload; no SMS (`SMS-01`). **Share quote** is the customer file path (email/WhatsApp ride the OS share sheet). A successful share marks eligible drafts `sent` (phone optional) so history shows Sent and SYNC-06 freeze applies. Cancel, share-API fail, or an empty quote skip mark-sent. Sharing again on an already-sent quote is a no-op.
- **Old-quote OCR** is not shipped: photos/PDFs can be picked (max 3) but extraction is a paste stub. Working path is paste lines → `source=imported` rate-card upsert.
- **PHOTO-01 Vision** is not shipped. Draft **Import from photo** is a camera/gallery stub on the existing photo-on-line path: stores the still, creates an adhoc line named from the filename or “Imported item”, **price blank**. It does not parse dollar amounts from OCR.
- **FAIL-01** map is [docs/WORKFLOW-failure-edge-cases.md](docs/WORKFLOW-failure-edge-cases.md) (16 scenarios: detection, UX, recovery, status). **FAIL-02** mic denied: in-app Alert + Settings (`mic-permission.ts` / `voice-record.tsx`). **FAIL-03** queues the local recording when upload/NetInfo is down (Quotes shows **Queued** / will retry; no mid-flow Alert). **FAIL-04** retries the original `documentDirectory` recording on the same quote; **FAIL-05** keeps a flagged partial draft plus Add items. **FAIL-07** writes a local `resume_checkpoints` row while recording or editing a draft and prompts **Resume where you left off** after auth restore. Remaining **`FAIL-06` / `FAIL-08`** (SMS, FCM) are not implemented — do not build them from the map.

When you mention defects, prefer what is in the tree on `master` over open-PR speculation.

---

## Planning docs — what to trust

| Path | Trust |
|------|--------|
| `CONTEXT.md` (this file) | Current agent briefing |
| `docs/DEPLOY-RAILWAY.md` | Railway Start Command: `npm start` runs SQL migrations then the API |
| `docs/EAS-ANDROID.md` | Android internal/preview EAS APK (no USB/Metro); `EXPO_PUBLIC_API_URL` for Railway HTTPS |
| `docs/WORKFLOW-failure-edge-cases.md` | FAIL-01: 16 scenarios mapped to code (detection / UX / recovery / status) |
| `.planning/REQUIREMENTS.md` | Requirement IDs and checkbox intent |
| `.planning/phases/**/SUMMARY.md` | Historical “what landed in that plan” |
| `.planning/PHYSICAL-DEVICE-TESTING.md` | Device UAT procedure (fix LAN URL there if you change it) |
| `.planning/STATE.md`, `ROADMAP.md`, `PROJECT.md` | Stubs pointing here — not a second status source |
| `.planning/config.json` | Removed (GSD workflow junk) |
| `.claude/next-session-prompt.md` | Removed (pointed at already-merged `feat/p5-04-pipeline-closure`) |

If STATE/ROADMAP/PROJECT and this file ever disagree, **this file wins**, then the tree.
