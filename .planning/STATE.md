---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Phase 5 code-complete — awaiting on-device Human UAT against live Railway backend
stopped_at: Backend deployed to Railway + voice pipeline fixed live + app running on physical Samsung (device dev build); Phase 5 UAT not yet run
last_updated: "2026-07-24"
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 16
  completed_plans: 16
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Contractor describes a job on-site, customer-approved quote in hand before driving off — zero paperwork at night.
**Current focus:** Phase 05 — voice-to-quote-pipeline (code-complete; awaiting on-device UAT)

## Current Position

Phase: 05 (voice-to-quote-pipeline) — CODE-COMPLETE, AWAITING HUMAN UAT
Plan: 4 of 4 done. Backend now deployed and verified on Railway (the UAT blocker — a broken
voice backend — is fixed). Next gate is running `05-HUMAN-UAT.md` on the physical device
against the live Railway backend.

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: none yet
- Trend: -

*Updated after each plan completion*
| Phase 01-foundation P01 | 3 | 2 tasks | 15 files |
| Phase 01 P02 | 3m | 2 tasks | 4 files |
| Phase 01-foundation P03 | 2m | 2 tasks | 11 files |
| Phase 01 P04 | 15m | 2 tasks | 10 files |
| Phase 02-onboarding P01 | 2m | 2 tasks | 5 files |
| Phase 02-onboarding P02 | 8m | 2 tasks | 9 files |
| Phase 03-catalog-management P01 | 8 | 2 tasks | 3 files |
| Phase 03-catalog-management P02 | 4m | 2 tasks | 10 files |
| Phase 03-catalog-management P03 | 2 | 1 tasks | 3 files |
| Phase 04-quote-review-and-history P02 | 3m | 2 tasks | 8 files |
| Phase 04-quote-review-and-history P01 | 6 | 2 tasks | 13 files |
| Phase 04-quote-review-and-history P03 | 10m | 3 tasks | 6 files |
| Phase 05-voice-to-quote-pipeline P02 | 6m | 2 tasks | 13 files |
| Phase 05-voice-to-quote-pipeline P01 | 10m | 2 tasks | 7 files |
| Phase 05-voice-to-quote-pipeline P03 | 6m | 2 tasks | 7 files |
| Phase 05-voice-to-quote-pipeline P04 | 15 | 4 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Offline-first (WatermelonDB) is non-negotiable — must be wired on Day 1; retrofitting is a rewrite
- Catalog-constraint architecture has two validation layers: GPT-4o system prompt + backend ID validation
- All prices stored as integer cents; quote_snapshots are write-once via DB trigger
- Audio deleted from R2 immediately after Whisper transcription (PII)
- Polling at 1.5s for AI results (not WebSockets) — sufficient at MVP scale
- [Phase 01-foundation]: npm workspaces monorepo: zero extra tooling, npm-native, adequate for 2-app structure
- [Phase 01-foundation]: NodeNext module resolution in backend tsconfig: required for ESM import paths in migrate.ts
- [Phase 01-foundation]: pg Pool error handler calls process.exit(-1): prevents silent zombie connections
- [Phase 01]: SHA-256 hash stored for refresh tokens (never plaintext) — revocable without storing secret material
- [Phase 01]: Token rotation on every refresh — limits refresh token reuse window
- [Phase 01]: Logout always returns 200 and same 401 message for wrong password/unknown user — prevents enumeration attacks
- [Phase 01-foundation]: WatermelonDB JSI adapter enabled for SQLite performance on device
- [Phase 01-foundation]: Sync queue dead_letter threshold: 5 retries; full exponential schedule deferred to Phase 7
- [Phase 01-foundation]: Lazy dynamic import for auth-store in apiClient prevents circular dependency at module initialization
- [Phase 01-foundation]: restoreSession sets tokens immediately from SecureStore even if access token may be stale; first API call auto-refreshes
- [Phase 01-foundation]: logout best-effort: server revocation attempted but local session cleared regardless of network failure
- [Phase 02-onboarding]: Duplicate seeding detected via contractors.trade column — 409 if trade already set, no separate seeding_state table needed
- [Phase 02-onboarding]: Sequential INSERT per template item to capture per-row RETURNING id for seed response payload
- [Phase 02-onboarding]: onboardingComplete persisted to SecureStore on setOnboardingComplete(); restored in restoreSession() so returning users skip onboarding on relaunch
- [Phase 02-onboarding]: segments[1] cast to string[] to work around expo-router useSegments() 1-tuple type — runtime has more elements than static type declares
- [Phase 03-catalog-management]: VALID_UNITS as const tuple validates unit at both runtime and TypeScript type level
- [Phase 03-catalog-management]: PUT /:id uses RETURNING clause to return updated item in single round-trip (no subsequent SELECT)
- [Phase 03-catalog-management]: PATCH /:id/archive includes is_archived=FALSE in WHERE so already-archived items return 404 (idempotent soft-delete)
- [Phase 03-catalog-management]: contractor.id used (not contractorId) — ContractorResponse type uses id field; plan spec referenced contractorId which does not exist
- [Phase 03-catalog-management]: WatermelonDB observe() subscription for reactive catalog list — simplest pattern without withObservables HOC overhead
- [Phase 03-catalog-management]: Archive operations route through PATCH /catalog/:id/archive — matches backend spec and REST semantics for state transition
- [Phase 03-catalog-management]: patch method added to apiClient following existing request() pattern — consistent with get/post/put/delete
- [Phase 04-quote-review-and-history]: format-relative-date implemented with vanilla Date math — avoids date-fns dependency for a simple 4-tier relative date format
- [Phase 04-quote-review-and-history]: tokens.ts success color and display typography added in Plan 02 (were referenced as Plan 01 additions but were missing)
- [Phase 04-quote-review-and-history]: quote_line_items has no FK to catalog_items (snapshot model per D-20) — quotes are immutable after send
- [Phase 04-quote-review-and-history]: canSend accepts itemCount: number (not array) — cleaner validation interface without coupling to LineItem type
- [Phase 04-quote-review-and-history]: router.push uses as any cast for draft/[id] and quote/[id] — expo-router typed routes require files at compile time, routes exist at runtime
- [Phase 04-quote-review-and-history]: Draft sync returns early if parent quote has no serverId yet — sync queue will retry once quote create syncs and writes back server ID
- [Phase 04-quote-review-and-history]: Send Quote transitions to draft_queued and enqueues full payload (status, customerPhone, totalCents, lineItems) — Phase 6 wires actual SMS delivery
- [Phase 05-voice-to-quote-pipeline]: FileSystem.moveAsync from cacheDirectory to documentDirectory immediately after stopAndUnloadAsync: required per VOICE-02 for Android cache eviction safety
- [Phase 05-voice-to-quote-pipeline]: schemaMigrations v2 passed to SQLiteAdapter: WatermelonDB upgrades existing databases without data loss on schema bump
- [Phase 05-voice-to-quote-pipeline]: Polling loop in QuotesScreen useEffect watching quotes array: reactive to WatermelonDB observable, auto-stops when no ai_processing quotes remain
- [Phase 05-voice-to-quote-pipeline]: pg-boss WorkHandler receives Job[] batch array; localConcurrency:2 used (teamSize does not exist in v12)
- [Phase 05-voice-to-quote-pipeline]: package.json type=module required for NodeNext ESM module resolution (fixes pre-existing migrate.ts build failure)
- [Phase 05-voice-to-quote-pipeline]: confidenceTier returns clean/review/needs_input with no raw float values exposed to UI
- [Phase 05-voice-to-quote-pipeline]: lineItems.length (not lineItems array) used as auto-scroll effect dependency to prevent re-scroll on every edit
- [Phase 05-voice-to-quote-pipeline]: lineItemsJson written before q.status update to prevent race where user taps DraftReadyToast before data arrives
- [Phase 05-voice-to-quote-pipeline]: getDraftLineItems network failure falls back to status-only transition — quote never stuck in ai_processing forever
- [Phase 05-voice-to-quote-pipeline]: GET /draft/:quoteId returns 404 when status is still ai_processing — mobile should not call until polling shows complete

#### Post-milestone deploy/device work (2026-07, tracked only in HANDOFF.md until now)
- [Deploy]: Backend deployed to Railway and verified E2E — `https://quotesnap-production-1001.up.railway.app`. Auth, manual quotes, sync, and the full voice→AI pipeline all confirmed live. (Fulfills the backend portion of backlog 999.1.)
- [Device/build]: **WatermelonDB JSI adapter DISABLED (`jsi: false`) — SUPERSEDES the earlier "JSI adapter enabled" decision above.** RN 0.76.5 / Expo 52 removed `JSIModulePackage`/`JSIModuleSpec` that WatermelonDB's android-jsi imports, so the build wouldn't compile. Now uses the async bridge adapter (fully functional). Gradle/MainApplication edits are gitignored (Expo regenerates `android/`) and fragile — a future `expo prebuild --clean` wipes them; bake into a config plugin / post-prebuild guard (Phase 3 / device hardening).
- [Voice backend fix `6b951aa`]: Whisper pinned to Hebrew via `WHISPER_LANGUAGE=he` — auto-detect mistook Hebrew for Arabic and returned garbage.
- [Voice backend fix `e9b14e9`]: Use OpenAI `toFile()` instead of global `new File()` — `File` only exists on Node ≥20; Railway built on Node 18 and `new File()` threw, killing every voice job before transcription.
- [Voice backend fix]: Railway `OPENAI_API_KEY` had been truncated (missing last 8 chars → 401) — re-pasted the full key. This was the final blocker to a working voice pipeline.

### Pending Todos

None yet.

### Blockers/Concerns

- Samsung Galaxy A32 FCM kill risk: must test push notifications on physical device before Phase 6 ships
- Android audio buffer: must use FileSystem.moveAsync to documentDirectory immediately post-recording (Phase 5)
- Quote expiry TTL value (SMS-10): default 72h but exact value to be confirmed before Phase 6
- **Secrets exposed in chat (2026-07):** the OpenAI key + R2 secret were pasted into chat while debugging. Low risk for a demo (OpenAI has a $5 hard cap) but rotate both post-demo and re-update Railway with the FULL value (mind the earlier truncation).
- **Phase 5 `totalCents` bug (the one true Phase 5 correctness gap):** the on-device voice poller writes line items to the draft and flips status but never persists `quote.totalCents` (`draftData.totalCents` is dropped), so the quote row total shows $0. Fix as part of the Phase 5 UAT pass. Poller/orphan/retry robustness is Phase 7, not this.

## Session Continuity

Last session: 2026-07-18 (handoff) — see HANDOFF.md / NEXT-SESSION-PLAN.md
Stopped at: Backend live on Railway + voice pipeline fixed & verified E2E + app running on physical Samsung. Phase 5 Human UAT still not run.

### What to do next

Phase 5 (Voice-to-Quote Pipeline) is code-complete and the **backend blocker is now gone** —
the voice pipeline was broken during the original April UAT window (truncated OpenAI key on
Railway + Whisper/Node-18 bugs), all since fixed. The Phase 5 Human UAT has therefore **never
been run against a working backend**. That is the real next gate.

Before/while running UAT, fix the **one Phase 5 correctness bug**: the on-device poller never
persists `quote.totalCents` (draft total shows $0) — see Blockers/Concerns. The
poller-off-screen / orphan-sweep / retry-schedule robustness items are **Phase 7**, not this.

**Step 1 — Backend is already live on Railway** (`https://quotesnap-production-1001.up.railway.app`,
`GET /health` → ok). No local backend needed for device UAT. (Local dev is still possible via the
Docker note below if you want to iterate on the backend.)

**Step 2 — Run the app on the physical Android device** (voice recording needs native audio
hardware; emulators are unreliable for mic)

- Plug in Android phone with USB Debugging on → `cd apps/mobile && npm run android`
- The dev build already reads `extra.apiUrl` → Railway (not `10.0.2.2`, which is emulator-only)
- Note: this build has WatermelonDB JSI disabled (`jsi:false`) for RN 0.76 — see Decisions

**Step 3 — Run the 3 Phase 5 tests** (file: `.planning/phases/05-voice-to-quote-pipeline/05-HUMAN-UAT.md`)

1. Full AI pipeline E2E: record audio → AI processing → draft screen shows confidence badges (amber Review / red Needs Input); first red auto-scrolls; DraftReadyToast appears
2. Offline queue: airplane mode → record → see queued row → re-enable network → row transitions to ai_processing → draft_local → toast
3. Manual Quote FAB regression: ensures pre-Phase-5 manual draft creation still works

**Step 4 — Resume this conversation and type:**

- `"approved"` → phase gets marked complete, move to Phase 6 (SMS + customer approval)
- Describe any issues → gap closure plans get created automatically

### Pending after Phase 5

- PR 3 (sync queue correctness) and PR 4 (login OR query security fix) — see `.planning/phases/01-foundation/prs/PR-PLAN.md`

### Docker note

Local Postgres is running on port 5432. Docker quotesnap-db container is on port 5433.
DATABASE_URL in apps/backend/.env uses port 5433.
Start container before backend dev: `docker start quotesnap-db`
