---
phase: 05-voice-to-quote-pipeline
plan: "04"
subsystem: api
tags: [postgres, voice, confidence, watermelondb, pg-boss, openai]

# Dependency graph
requires:
  - phase: 05-voice-to-quote-pipeline/05-01
    provides: quote_line_items table, voice upload and status endpoints
  - phase: 05-voice-to-quote-pipeline/05-02
    provides: voice recording mobile flow, polling loop in quotes.tsx
  - phase: 05-voice-to-quote-pipeline/05-03
    provides: confidence badges on LineItemRow, DraftReadyToast, auto-scroll

provides:
  - confidence REAL column on quote_line_items (schema + migration applied)
  - voice-processor INSERT persists confidence scores to DB
  - GET /voice/draft/:quoteId endpoint returning lineItems with confidence
  - getDraftLineItems API function in mobile voice.ts
  - polling completion handler writes lineItemsJson before status transition

affects:
  - 05-voice-to-quote-pipeline
  - draft/[id].tsx confidence badge rendering (receives real data now)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lineItemsJson written before q.status update in DB transaction to prevent race on toast tap"
    - "GET /draft/:quoteId uses ownership check on contractor_id matching the auth token"
    - "Fallback: getDraftLineItems network failure still transitions to draft_local to prevent stuck states"

key-files:
  created:
    - apps/mobile/src/api/voice.ts (getDraftLineItems function added)
  modified:
    - apps/backend/src/db/migrations/004_voice.sql
    - apps/backend/src/workers/voice-processor.ts
    - apps/backend/src/routes/voice.ts
    - apps/mobile/app/(app)/quotes.tsx

key-decisions:
  - "lineItemsJson written before q.status update — prevents race where user taps toast and opens draft screen before data arrives"
  - "getDraftLineItems network failure falls back to status-only transition — quote never stuck in ai_processing forever"
  - "IF NOT EXISTS guard in migration makes re-running 004_voice.sql safe and idempotent"
  - "GET /draft/:quoteId returns 404 when status is still ai_processing — mobile should not call it until polling shows complete"

patterns-established:
  - "Confidence pipeline: GPT-4o -> voice-processor INSERT -> quote_line_items.confidence -> GET /draft -> getDraftLineItems -> drafts.lineItemsJson -> draft/[id].tsx"

requirements-completed: [VOICE-07, VOICE-08]

# Metrics
duration: 15min
completed: 2026-04-03
---

# Phase 05 Plan 04: Gap Closure — Confidence Score Pipeline Summary

**Four-gap confidence pipeline fix: DB column added, INSERT fixed, GET /draft endpoint built, mobile polling handler wired end-to-end so confidence badges receive real AI scores**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-03T22:00:00Z
- **Completed:** 2026-04-03T22:18:33Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments

- Added `confidence REAL` column to `quote_line_items` via migration and applied to Docker Postgres instance
- Fixed `voice-processor.ts` INSERT to include confidence in column list and pass `item.confidence` as `$5`
- Implemented `GET /voice/draft/:quoteId` returning `{ quoteId, totalCents, lineItems: [...confidence...] }` with contractor ownership verification
- Added `getDraftLineItems` function to mobile voice API and wired it into the polling completion handler so `drafts.lineItemsJson` is populated before status transitions to `draft_local`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add confidence REAL column to 004_voice.sql migration** - `4e87362` (feat)
2. **Task 2: Fix INSERT in voice-processor.ts to persist confidence** - `6a34b4e` (fix)
3. **Task 3: Implement GET /voice/draft/:quoteId endpoint in voice.ts** - `c290dc1` (feat)
4. **Task 4: Call getDraftLineItems in polling completion handler and write lineItemsJson** - `27a6bb1` (feat)

## Files Created/Modified

- `apps/backend/src/db/migrations/004_voice.sql` - Added ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS confidence REAL
- `apps/backend/src/workers/voice-processor.ts` - Fixed INSERT to include confidence column and item.confidence param
- `apps/backend/src/routes/voice.ts` - Added GET /voice/draft/:quoteId endpoint with auth, ownership check, confidence in SELECT
- `apps/mobile/src/api/voice.ts` - Added getDraftLineItems function calling GET /voice/draft/:quoteId
- `apps/mobile/app/(app)/quotes.tsx` - Updated polling completion to call getDraftLineItems and write lineItemsJson to draft before status update

## Decisions Made

- `lineItemsJson` is written inside the same `database.write` before `q.status` update — prevents a race where the user taps the DraftReadyToast and opens the draft screen before lineItemsJson is populated
- `getDraftLineItems` network failure has an outer catch that still transitions `q.status` to `draft_local` — quote never gets stuck in `ai_processing` state if the fetch fails
- `IF NOT EXISTS` guard in migration makes the script safe to re-run if voice_job_id column already exists from a prior run

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing getDraftLineItems function to mobile voice.ts**
- **Found during:** Task 4 (polling completion handler)
- **Issue:** Plan required importing `getDraftLineItems` from `../../src/api/voice` but the function did not exist in that file — only `uploadAudio` and `getVoiceStatus` were present
- **Fix:** Added `getDraftLineItems` function and `DraftLineItemsResponse` interface to `apps/mobile/src/api/voice.ts` calling `GET /voice/draft/:quoteId`
- **Files modified:** `apps/mobile/src/api/voice.ts`
- **Verification:** Import resolves, TypeScript check passes (only pre-existing expo-av type error)
- **Committed in:** `27a6bb1` (Task 4 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — missing function referenced by plan)
**Impact on plan:** Required fix for Task 4 to compile. No scope creep.

## Issues Encountered

- `psql` not in PATH on Windows bash — worked around by using `docker exec quotesnap-db psql` after starting the container with `docker start quotesnap-db`

## Known Stubs

None — all data paths are wired. Confidence scores flow from GPT-4o through the full pipeline to LineItemRow badges.

## Next Phase Readiness

- Confidence pipeline is fully wired end-to-end
- `draft/[id].tsx` LineItemRow confidence badges will now render real confidence scores when AI processing completes
- Ready for Phase 05 remaining plans (SMS send, customer approval page, push notifications)

---
*Phase: 05-voice-to-quote-pipeline*
*Completed: 2026-04-03*

## Self-Check: PASSED

- FOUND: apps/backend/src/db/migrations/004_voice.sql
- FOUND: apps/backend/src/workers/voice-processor.ts
- FOUND: apps/backend/src/routes/voice.ts
- FOUND: apps/mobile/app/(app)/quotes.tsx
- FOUND: .planning/phases/05-voice-to-quote-pipeline/05-04-SUMMARY.md
- FOUND: 4e87362 (Task 1), 6a34b4e (Task 2), c290dc1 (Task 3), 27a6bb1 (Task 4)
