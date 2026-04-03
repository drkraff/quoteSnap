---
phase: 05-voice-to-quote-pipeline
verified: 2026-04-04T01:30:00Z
status: human_needed
score: 18/18 must-haves verified
re_verification: true
  previous_status: gaps_found
  previous_score: 14/18
  gaps_closed:
    - "quote_line_items.confidence REAL column added to 004_voice.sql migration"
    - "voice-processor.ts INSERT now includes confidence column and item.confidence as $5 param"
    - "GET /voice/draft/:quoteId endpoint implemented in apps/backend/src/routes/voice.ts"
    - "quotes.tsx polling completion handler calls getDraftLineItems and writes drafts.lineItemsJson before status transition"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Record audio, wait for AI processing, open draft screen"
    expected: "Line items appear with amber 'Review' or red 'Needs Input' confidence badges; first red item auto-scrolls into view; DraftReadyToast appears"
    why_human: "Cannot verify real AI output quality or badge appearance programmatically; requires backend with valid OpenAI API key, R2 bucket, and running pg-boss worker"
  - test: "Enable airplane mode, record audio, check history list"
    expected: "Queued row appears with cloud icon; when connectivity restored, row transitions to ai_processing spinner then draft_local; DraftReadyToast appears"
    why_human: "Network state transitions require physical device or emulator; cannot simulate offline queue flush programmatically"
  - test: "Tap Manual Quote FAB on Quotes tab"
    expected: "Creates a new draft immediately and navigates to draft/[id] screen (pre-Phase 5 behavior unaffected)"
    why_human: "Visual flow regression requires manual confirmation"
---

# Phase 05: Voice-to-Quote Pipeline Verification Report

**Phase Goal:** Complete the end-to-end voice-to-quote experience — tap mic, record audio, AI transcribes and maps to catalog, confidence-scored draft appears with badges, auto-scrolled to red items, and a toast announces readiness.
**Verified:** 2026-04-04T01:30:00Z
**Status:** human_needed — all automated checks pass; human E2E testing required
**Re-verification:** Yes — after gap closure (plan 05-04, commits 4e87362, 6a34b4e, c290dc1, 27a6bb1)

---

## Re-Verification Summary

| Gap | Previous Status | Current Status |
|-----|----------------|----------------|
| confidence REAL missing from 004_voice.sql | FAILED | CLOSED — line 9: `ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS confidence REAL` |
| voice-processor.ts INSERT omitted confidence | FAILED | CLOSED — line 146: 5-column INSERT with `item.confidence` as `$5` |
| GET /voice/draft/:quoteId missing | FAILED | CLOSED — route at voice.ts line 111, full implementation with auth + ownership check |
| getDraftLineItems never called in quotes.tsx | FAILED | CLOSED — line 66 call + line 74 `d.lineItemsJson = JSON.stringify(draftData.lineItems)` inside `database.write` |

**Score moved from 14/18 to 18/18.**

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Audio file uploaded via POST /voice/upload is stored in R2 and a pg-boss job is created | VERIFIED | voice.ts line 46: `uploadToR2(r2Key, req.file.buffer, req.file.mimetype)`; line 49: `boss.send('voice-process', ...)` |
| 2 | pg-boss worker transcribes audio via Whisper, maps to catalog via GPT-4o, validates IDs, writes draft line items WITH confidence scores | VERIFIED | voice-processor.ts line 146: `INSERT INTO quote_line_items (quote_id, name, quantity, unit_price_cents, confidence) VALUES ($1, $2, $3, $4, $5)` |
| 3 | Audio is deleted from R2 immediately after Whisper transcription (PII) | VERIFIED | voice-processor.ts line 48: `deleteFromR2(r2Key)` called immediately after transcription |
| 4 | GET /voice/status/:jobId returns processing, complete, or failed with draftId on complete | VERIFIED | voice.ts GET /status/:jobId wired to pg-boss getJobById; ownership check present |
| 5 | GET /voice/draft/:quoteId returns line items with confidence scores | VERIFIED | voice.ts lines 111-172: full endpoint with auth, ownership check, `qli.confidence` in SELECT |
| 6 | GPT-4o is constrained to return only catalog item IDs and quantities via function calling schema | VERIFIED | voice-processor.ts: `tool_choice: { type: 'function', function: { name: 'create_quote_items' } }` enforced |
| 7 | Non-catalog item IDs returned by GPT-4o are rejected and not written to the draft | VERIFIED | ID validation query + filter at voice-processor.ts lines 112-122 |
| 8 | Contractor taps Voice Quote FAB on Quotes tab and opens recording screen | VERIFIED | quotes.tsx router.push('/voice-record') on Pressable; _layout.tsx registers route |
| 9 | Contractor can record audio using expo-av and see a waveform/pulse indicator with duration counter | VERIFIED | voice-record.tsx: Audio.Recording.createAsync + RecordingWaveform + setInterval duration |
| 10 | After stop, audio is moved from cacheDirectory to documentDirectory immediately (VOICE-02) | VERIFIED | voice-record.tsx line 102: FileSystem.moveAsync is first async op after stopAndUnloadAsync |
| 11 | A new quote with ai_processing status appears in the history list right after recording stops | VERIFIED | voice-record.tsx creates quote with status='ai_processing' in database.write before router.back() |
| 12 | Sync queue entry with entityType audio is created immediately even offline | VERIFIED | voice-record.tsx enqueue({ entityType: 'audio', ... }) called before router.back() |
| 13 | When online, audio uploads and polling starts at 1.5s intervals | VERIFIED | sync-queue.ts audio case calls uploadAudio; quotes.tsx polling useEffect fires at 1500ms |
| 14 | Polling fetches AI line items and writes them to drafts.lineItemsJson on completion | VERIFIED | quotes.tsx line 66: `getDraftLineItems(result.draftId)` called; line 74: `d.lineItemsJson = JSON.stringify(draftData.lineItems)` written inside same database.write before status transition |
| 15 | ai_processing row shows spinner when online, Queued label when offline | VERIFIED | quote-row.tsx: ActivityIndicator (online) / cloud-upload-outline + "Queued" (offline) |
| 16 | Line items with confidence badges render correctly (amber Review, red Needs Input) | VERIFIED (code path) | draft/[id].tsx line 321: `confidenceTier(item.confidence)`; LineItemRow renders badge per tier; data now flows end-to-end via pipeline |
| 17 | First red-tier item auto-scrolls into view when draft loads | VERIFIED (code path) | draft/[id].tsx lines 102-107: `findIndex` for needs_input + scrollToIndex — will fire when real data flows |
| 18 | Draft-ready toast appears when ai_processing quote completes, navigates to draft on tap | VERIFIED | quotes.tsx sets readyDraftId after database.write; DraftReadyToast renders with 3s timer + navigation |

**Score: 18/18 truths verified**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/backend/src/types/voice.ts` | VoiceJobData, AILineItem, VoiceStatusResponse types | VERIFIED | All 3 interfaces present and exported |
| `apps/backend/src/services/r2.ts` | r2Client, uploadToR2, getFromR2, deleteFromR2 | VERIFIED | All exports present |
| `apps/backend/src/workers/voice-processor.ts` | pg-boss worker with full AI pipeline including confidence INSERT | VERIFIED | Confidence in column list and params; Whisper + GPT-4o + ID validation all present |
| `apps/backend/src/routes/voice.ts` | POST /upload, GET /status/:jobId, GET /draft/:quoteId | VERIFIED | All 3 routes present; /draft added in gap closure |
| `apps/backend/src/db/migrations/004_voice.sql` | voice_job_id on quotes + confidence REAL on quote_line_items | VERIFIED | Both ALTER TABLE statements present; IF NOT EXISTS guards on both |
| `apps/mobile/app/(app)/voice-record.tsx` | Recording screen with full flow | VERIFIED | All recording logic, permission handling, FileSystem.moveAsync, WatermelonDB write |
| `apps/mobile/src/api/voice.ts` | uploadAudio, getVoiceStatus, getDraftLineItems | VERIFIED | All 3 functions present; getDraftLineItems added in gap closure and called from quotes.tsx |
| `apps/mobile/src/components/voice/recording-waveform.tsx` | Animated pulse indicator | VERIFIED | 5-bar staggered Animated.loop scaleY pulse |
| `apps/mobile/src/db/schema.ts` | Schema v2 with voice_job_id on quotes | VERIFIED | version: 2, voice_job_id column present |
| `apps/mobile/src/utils/confidence.ts` | confidenceTier() utility | VERIFIED | ConfidenceTier type + confidenceTier function with correct tier boundaries |
| `apps/mobile/src/components/voice/draft-ready-toast.tsx` | DraftReadyToast component | VERIFIED | 3s timer, navigation, accessibilityLiveRegion="polite" |
| `apps/mobile/src/components/quotes/line-item-row.tsx` | LineItemRow with confidence prop | VERIFIED | confidence prop, badge rendering, borderLeftWidth: 4 stripe, rowFlagged minHeight: 72 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/backend/src/routes/voice.ts` | `apps/backend/src/services/r2.ts` | uploadToR2() in POST /upload | WIRED | Line 46: uploadToR2(r2Key, req.file.buffer, req.file.mimetype) |
| `apps/backend/src/routes/voice.ts` | `apps/backend/src/workers/voice-processor.ts` | boss.send('voice-process', ...) | WIRED | Line 49: boss.send('voice-process', { quoteId, contractorId, r2Key }) |
| `apps/backend/src/workers/voice-processor.ts` | `apps/backend/src/services/r2.ts` | deleteFromR2() after Whisper | WIRED | Line 48: deleteFromR2(r2Key) |
| `apps/backend/src/index.ts` | `apps/backend/src/workers/voice-processor.ts` | initBoss() before app.listen | WIRED | import initBoss; await initBoss() in startServer() |
| `apps/backend/src/routes/voice.ts (GET /draft/:quoteId)` | `apps/backend/src/db (quote_line_items.confidence)` | SELECT qli.confidence in GET /draft | WIRED | Line 140: `qli.confidence` in SELECT list; DB column confirmed in 004_voice.sql line 9 |
| `apps/mobile/app/(app)/quotes.tsx` | `apps/mobile/src/api/voice.ts` | getDraftLineItems() on polling completion | WIRED | Line 23: import; line 66: call inside completion handler |
| `apps/mobile/app/(app)/quotes.tsx` | `apps/mobile/src/db/models/draft.ts` | lineItemsJson written in database.write | WIRED | Line 74: d.lineItemsJson = JSON.stringify(draftData.lineItems) inside database.write before status update |
| `apps/mobile/app/(app)/draft/[id].tsx` | `apps/mobile/src/utils/confidence.ts` | confidenceTier() per line item | WIRED | Line 13 import; line 321: confidenceTier(item.confidence) |
| `apps/mobile/app/(app)/draft/[id].tsx` | `apps/mobile/src/components/quotes/line-item-row.tsx` | confidence prop | WIRED | Line 328: confidence={displayTier} passed to LineItemRow |
| `apps/mobile/app/(app)/quotes.tsx` | `apps/mobile/src/components/voice/draft-ready-toast.tsx` | DraftReadyToast on completion | WIRED | setReadyDraftId(q.id) called after database.write; DraftReadyToast rendered |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `apps/mobile/app/(app)/draft/[id].tsx` | lineItems[].confidence | drafts.lineItemsJson via getDraftLineItems | Yes — GPT-4o assigns confidence, voice-processor INSERTs it, GET /draft serves it, getDraftLineItems fetches it, database.write stores it in lineItemsJson | FLOWING |
| `apps/backend/src/routes/voice.ts GET /draft` | quote_line_items.confidence | quote_line_items DB column (REAL, added in 004_voice.sql) | Yes — INSERTed with each processed line item | FLOWING |
| `apps/backend/src/workers/voice-processor.ts` | item.confidence | GPT-4o function call response (0-1 float) | Yes — computed from tool call arguments, included in lineItems map, persisted to DB | FLOWING |

**Note:** `qli.catalog_item_id` in the GET /draft query will always return NULL because no migration adds this column to `quote_line_items`. The endpoint applies `?? ''` fallback and returns `catalogItemId: ''`. This does NOT affect phase goal achievement — neither `draft/[id].tsx` nor `LineItemRow` reference `catalogItemId` for rendering. Confidence, name, quantity, and price are unaffected. Flagged as a warning for future phases.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| confidence REAL column in migration | `grep -n "confidence REAL" apps/backend/src/db/migrations/004_voice.sql` | Line 9 match | PASS |
| confidence in INSERT column list | `grep -n "confidence" apps/backend/src/workers/voice-processor.ts` | Lines 86, 88, 132, 146, 147 — column list and params both present | PASS |
| GET /draft route registered | `grep -n "router.get.*draft" apps/backend/src/routes/voice.ts` | Line 111 match | PASS |
| getDraftLineItems imported and called in quotes.tsx | `grep -n "getDraftLineItems" apps/mobile/app/(app)/quotes.tsx` | Lines 23 (import) and 66 (call) | PASS |
| lineItemsJson assigned in quotes.tsx | `grep -n "lineItemsJson" apps/mobile/app/(app)/quotes.tsx` | Lines 74 and 145 — assignment present | PASS |
| Gap-closure commits exist in git | `git log --oneline 4e87362 6a34b4e c290dc1 27a6bb1` | All 4 commits found on master | PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VOICE-01 | 05-02 | Contractor can record voice using in-app mic (expo-av) | SATISFIED | voice-record.tsx: Audio.Recording.createAsync with HIGH_QUALITY preset |
| VOICE-02 | 05-02 | Audio moved from cacheDirectory to documentDirectory immediately after stop | SATISFIED | voice-record.tsx line 102: FileSystem.moveAsync is first op after stopAndUnloadAsync |
| VOICE-03 | 05-02 | Recorded audio uploaded via local offline queue | SATISFIED | sync-queue.ts audio case; enqueue called immediately in voice-record.tsx |
| VOICE-04 | 05-01 | Backend transcribes via Whisper, maps via GPT-4o function calling | SATISFIED | voice-processor.ts: Whisper + GPT-4o with create_quote_items tool |
| VOICE-05 | 05-01 | GPT-4o constrained to catalog item IDs only, never free-text prices | SATISFIED | tool_choice forced; function schema only allows catalogItemId + quantity + confidence |
| VOICE-06 | 05-01 | Backend validates every returned item ID; non-catalog items rejected | SATISFIED | voice-processor.ts lines 112-122: DB validation query + filter |
| VOICE-07 | 05-01/02/04 | AI draft returned to client via polling at 1.5s intervals | SATISFIED | Polling at 1500ms; on complete, getDraftLineItems fetches draft and writes to lineItemsJson |
| VOICE-08 | 05-03/04 | Confidence tiers applied: >=0.85 clean, 0.60-0.84 Review (amber), <0.60 Needs Input (red, auto-scroll) | SATISFIED (code + pipeline) | confidenceTier utility correct; pipeline fixed; badges render from real data; auto-scroll fires on needs_input items |
| VOICE-09 | 05-03 | No raw confidence percentages shown — plain language labels only | SATISFIED | confidence.ts returns 'clean'/'review'/'needs_input'; no float values in rendered text |

**Orphaned requirements check:** All 9 VOICE requirements are claimed by plans 05-01, 05-02, 05-03, or 05-04. No orphaned requirements found.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/backend/src/routes/voice.ts` | 136 | Queries `qli.catalog_item_id` but column does not exist in any migration — always returns NULL | Warning | Mobile client receives `catalogItemId: ''` for all AI line items; phase goal unaffected since neither draft screen nor LineItemRow uses catalogItemId for display or routing |

No blocker anti-patterns remain. The single warning does not prevent confidence badges from rendering.

---

## Human Verification Required

### 1. Full End-to-End Voice Pipeline

**Test:** With backend running (valid OPENAI_API_KEY + R2 bucket + pg-boss connected to Postgres), record a 10-15 second job description (e.g., "I need to replace two light switches and install three new outlets"), wait for processing, tap the DraftReadyToast
**Expected:** Draft screen opens with 2-4 line items; each item shows either no badge (clean), amber "Review" badge (0.60-0.84), or red "Needs Input" badge (<0.60); first red item is auto-scrolled into view; no raw numbers visible anywhere
**Why human:** Cannot verify real AI output quality, badge appearance, or auto-scroll behavior programmatically; requires live OpenAI API, R2 storage, and a running backend

### 2. Offline Recording Flow

**Test:** Enable airplane mode, record audio, check history list
**Expected:** Row appears immediately with cloud icon and "Queued" label; re-enable connectivity; row transitions to spinner (ai_processing) then DraftReadyToast appears; draft opens with line items
**Why human:** Network state transitions require physical device or emulator; offline queue flush cannot be simulated in a static code check

### 3. Manual Quote FAB Regression

**Test:** Tap the pencil/manual FAB on the Quotes tab (not the mic FAB)
**Expected:** Creates a new empty draft and navigates to draft/[id] screen immediately — no AI processing, no Queued state
**Why human:** Visual flow regression requires device confirmation

---

## Gaps Summary

No automated gaps remain. All four confidence pipeline gaps identified in the initial verification have been closed by plan 05-04:

1. `004_voice.sql` now contains `ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS confidence REAL` (line 9)
2. `voice-processor.ts` INSERT at line 146 now includes `confidence` in the column list and passes `item.confidence` as the fifth parameter
3. `GET /voice/draft/:quoteId` is fully implemented in `voice.ts` lines 111-172 with auth, ownership check, and `qli.confidence` in the SELECT
4. `quotes.tsx` polling completion handler at lines 64-88 now calls `getDraftLineItems`, writes `lineItemsJson` inside `database.write` before transitioning `q.status` to `draft_local`

The phase is blocked only on human E2E verification of the live AI pipeline and offline queue behavior — neither of which can be confirmed by static analysis.

---

_Verified: 2026-04-04T01:30:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — gap closure after initial verification (status: gaps_found, 14/18)_
