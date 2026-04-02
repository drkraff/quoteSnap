---
phase: 04-quote-review-and-history
plan: "03"
subsystem: mobile-screens
tags: [react-native, expo-router, watermelondb, sync-queue, navigation, quotes]

dependency_graph:
  requires:
    - phase: 04-01
      provides: quote/draft WatermelonDB models, line-item utils, quote-validation, API client functions, sync queue enqueue
    - phase: 04-02
      provides: QuoteRow, LineItemRow, PriceEditSheet, CatalogPickerSheet, QuoteDetail components
  provides:
    - apps/mobile/app/(app)/_layout.tsx (Quotes tab in bottom navigation)
    - apps/mobile/app/(app)/quotes.tsx (history list + FAB)
    - apps/mobile/app/(app)/draft/[id].tsx (editable draft review screen)
    - apps/mobile/app/(app)/quote/[id].tsx (read-only quote detail screen)
    - apps/mobile/src/sync/sync-queue.ts (quote/draft entity handlers)
  affects:
    - Phase 05 (audio-capture) — quotes tab navigation and sync queue patterns established
    - Phase 06 (sms-send) — draft_queued status transition and send payload shape defined here

tech-stack:
  added: []
  patterns:
    - Expo Router file-based routing with Tabs.Screen href=null for hidden stack screens
    - WatermelonDB observe() subscription in screen useEffect for reactive list
    - FAB debounce guard (isCreating boolean) to prevent double-tap quote creation
    - Sync queue quote create: writeback serverId to local WatermelonDB after server response
    - Sync queue draft: routes via parent quote's serverId — draft cannot sync without server quote ID
    - KeyboardAvoidingView wrapping screen with Platform.OS ios/height behavior
    - router.push with as-any cast for typed routes not yet in expo-router's static manifest

key-files:
  created:
    - apps/mobile/app/(app)/quotes.tsx
    - apps/mobile/app/(app)/draft/[id].tsx
    - apps/mobile/app/(app)/quote/[id].tsx
  modified:
    - apps/mobile/app/(app)/_layout.tsx
    - apps/mobile/src/sync/sync-queue.ts
    - apps/mobile/src/components/quotes/quote-detail.tsx

key-decisions:
  - "router.push uses `as any` cast for draft/[id] and quote/[id] — expo-router typed routes require files to exist at compile time, cast is safe as routes exist at runtime"
  - "Draft sync waits for parent quote's serverId — if quote create hasn't synced yet, draft sync returns early and will retry on next queue run"
  - "Send Quote sets status to draft_queued and enqueues full line item payload — Phase 6 wires actual SMS delivery"

patterns-established:
  - "Expo tab-hidden stack screens: add Tabs.Screen with href: null for sub-screens (draft/[id], quote/[id])"
  - "Quote mutation pattern: database.write(draft + quote together) then enqueue — keeps WatermelonDB + sync queue in sync atomically"

requirements-completed:
  - REVIEW-01
  - REVIEW-02
  - REVIEW-03
  - REVIEW-04
  - REVIEW-05
  - REVIEW-06
  - HIST-01
  - HIST-02
  - HIST-03
  - HIST-04

duration: 10min
completed: "2026-04-02"
---

# Phase 4 Plan 03: Screen Wiring + Sync Queue Extension Summary

**Complete quotes flow wired: 3-tab navigation with Quotes history, FAB-created drafts with full line item editing (stepper/price/add/swipe-delete + undo), sticky phone footer, send validation, read-only detail screen, and sync queue extended to handle quote/draft entities end-to-end.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-02T13:25:00Z
- **Completed:** 2026-04-02T13:35:28Z
- **Tasks:** 3 (2 auto + 1 checkpoint auto-approved)
- **Files modified:** 6

## Accomplishments

- Quotes tab added as third tab in bottom nav with `document-text` Ionicons icon, history list reactive via WatermelonDB observe(), empty state, FAB with debounce guard
- Draft review screen: full line item CRUD (stepper, price sheet, catalog picker, swipe-delete with 4s undo toast), every mutation auto-saves to WatermelonDB + enqueues, sticky footer with phone input and send validation, KeyboardAvoidingView
- Sync queue extended: quote create (server ID writeback), quote update, draft sync via parent quote serverId — no more `Unhandled entity type` throw

## Task Commits

1. **Task 1: Tab layout + Quotes history screen + FAB + sync-queue extension** - `57dc92c` (feat)
2. **Task 2: Draft review screen + read-only quote detail screen** - `2bc19fd` (feat)
3. **Task 3: Human verify checkpoint** - auto-approved (auto_advance: true)

## Files Created/Modified

- `apps/mobile/app/(app)/_layout.tsx` — added Quotes tab (document-text icon) + hidden draft/[id] and quote/[id] stack screens
- `apps/mobile/app/(app)/quotes.tsx` — history list from WatermelonDB observe(), FAB creates draft_local quote + draft record + enqueues, routes draft_local to /draft/:id, others to /quote/:id
- `apps/mobile/app/(app)/draft/[id].tsx` — full editable draft screen: load quote+draft, observe draft changes, mutation handlers for quantity/price/add/delete, phone input with validation, send flow that sets draft_queued + enqueues full payload
- `apps/mobile/app/(app)/quote/[id].tsx` — read-only: loads from API if serverId exists, falls back to local draft line items if offline/no server ID
- `apps/mobile/src/sync/sync-queue.ts` — added quote create/update handlers with server ID writeback, draft sync handler via parent quote, replaced `throw` with `console.warn` for unknown entity types
- `apps/mobile/src/components/quotes/quote-detail.tsx` — bug fix: wrap ISO date strings in `new Date()` before passing to `formatRelativeDate`

## Decisions Made

- `router.push` uses `as any` cast for `draft/[id]` and `quote/[id]` — expo-router's TypeScript typed routes require files to exist at the time of type generation; cast is safe since files are always present at runtime.
- Draft sync returns early (no throw) if parent quote has no `serverId` yet — this is correct behavior; the sync queue will retry the draft entry once the quote create entry syncs and writes back the server ID.
- Send Quote transitions to `draft_queued` and enqueues a full payload (status + customerPhone + totalCents + lineItems). Phase 6 wires actual SMS delivery from this queued entry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed formatRelativeDate called with string instead of Date in quote-detail.tsx**
- **Found during:** Task 1 TypeScript verification
- **Issue:** `quote-detail.tsx` (from Plan 02) passed `quote.createdAt` and `quote.sentAt` (both `string` per props interface) directly to `formatRelativeDate(date: Date)`. TypeScript error TS2345.
- **Fix:** Wrapped both call sites with `new Date()` — `formatRelativeDate(new Date(quote.createdAt))` and `formatRelativeDate(new Date(quote.sentAt))`.
- **Files modified:** `apps/mobile/src/components/quotes/quote-detail.tsx`
- **Verification:** `npx tsc --noEmit` exits 0 after fix
- **Committed in:** `57dc92c` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in Plan 02 component discovered during compile)
**Impact on plan:** Fix was required for TypeScript to pass. No scope creep — single-line call site fix.

## Issues Encountered

None — plan executed cleanly with one Rule 1 auto-fix.

## Known Stubs

None. All screens load real data from WatermelonDB and/or backend API. Sync queue handlers make real API calls. The only "incomplete" behavior is that `draft_queued` status doesn't trigger actual SMS yet — this is intentional and documented as Phase 6 work.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 04 is fully complete — all quotes flow screens and sync wiring are in place
- Phase 05 (audio-capture) can begin: tab navigation and WatermelonDB patterns are established
- Phase 06 (sms-send) prerequisite: `draft_queued` status transition and enqueue payload shape are defined here

---
*Phase: 04-quote-review-and-history*
*Completed: 2026-04-02*

## Self-Check: PASSED

- apps/mobile/app/(app)/quotes.tsx: FOUND
- apps/mobile/app/(app)/draft/[id].tsx: FOUND
- apps/mobile/app/(app)/quote/[id].tsx: FOUND
- .planning/phases/04-quote-review-and-history/04-03-SUMMARY.md: FOUND
- Commit 57dc92c: FOUND
- Commit 2bc19fd: FOUND
