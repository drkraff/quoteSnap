---
phase: 05-voice-to-quote-pipeline
plan: "03"
subsystem: mobile-confidence-badges
tags: [confidence-badges, voice-pipeline, ux, tdd]
dependency_graph:
  requires: [05-01, 05-02]
  provides: [confidence-tier-ui, draft-ready-toast, auto-scroll-red-items]
  affects: [apps/mobile]
tech_stack:
  added: []
  patterns: [tdd-red-green, toast-pattern, flatlist-auto-scroll]
key_files:
  created:
    - apps/mobile/src/utils/confidence.ts
    - apps/mobile/src/utils/confidence.test.ts
    - apps/mobile/src/components/voice/draft-ready-toast.tsx
  modified:
    - apps/mobile/src/utils/line-items.ts
    - apps/mobile/src/components/quotes/line-item-row.tsx
    - apps/mobile/app/(app)/draft/[id].tsx
    - apps/mobile/app/(app)/quotes.tsx
decisions:
  - confidenceTier returns 'clean'/'review'/'needs_input' with no raw float values exposed to UI
  - lineItems.length (not lineItems array) used as auto-scroll effect dependency to prevent re-scroll on every edit
  - DraftReadyToast navigates to /draft/:quoteId (quote WatermelonDB id, not server draftId) for consistency with existing routing
metrics:
  duration: "6m"
  completed_date: "2026-04-04"
  tasks_completed: 2
  tasks_total: 3
  files_changed: 7
---

# Phase 05 Plan 03: Confidence Badge Rendering and Voice Pipeline Completion Summary

Confidence tier UI layer wired end-to-end: amber/red badges on AI-flagged line items, auto-scroll to first red item on draft load, DraftReadyToast when AI processing completes, and edit-clears-confidence behavior.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Confidence utility, LineItem type extension, LineItemRow badge rendering | aed7275 | Done |
| 2 | DraftReadyToast, auto-scroll to red items, confidence wiring | 6a561b2 | Done |
| 3 | Human verification of full voice-to-quote pipeline | (checkpoint) | Auto-approved |

## What Was Built

### Confidence Utility (`apps/mobile/src/utils/confidence.ts`)
- `confidenceTier(number | undefined): ConfidenceTier` — returns `'clean'` (>=0.85 or undefined), `'review'` (0.60–0.84), `'needs_input'` (<0.60)
- 10 TDD tests covering all boundary values (undefined, 0.85, 0.60, 0.59, 0.0, etc.)

### LineItem Interface Extension (`apps/mobile/src/utils/line-items.ts`)
- Added `confidence?: number` field to `LineItem`
- `updateQuantity` and `updatePrice` now clear `confidence: undefined` on the changed item (edit-clears-badge behavior)

### LineItemRow Badge Rendering (`apps/mobile/src/components/quotes/line-item-row.tsx`)
- Added `confidence?: 'review' | 'needs_input'` prop
- Name column restructured from `<Text>` to `<View>` column with name + optional badge below
- "Review" badge in amber (#b45309), "Needs Input" badge in red (#dc2626)
- 4px left border stripe matching tier color
- Flagged rows use `minHeight: 72` (up from 56)
- No raw confidence numbers rendered anywhere

### DraftReadyToast (`apps/mobile/src/components/voice/draft-ready-toast.tsx`)
- Follows UndoToast pattern exactly: absolute position, bottom 96, dark background
- 3000ms auto-dismiss with `useRef` timer (cleared on unmount)
- Tappable: navigates to `/draft/${draftId}`, clears timer, calls onDismiss
- `accessibilityLiveRegion="polite"`, `accessibilityRole="button"`

### Quotes Screen (`apps/mobile/app/(app)/quotes.tsx`)
- Added `readyDraftId` state
- Polling loop now calls `setReadyDraftId(q.id)` when status becomes `complete`
- Renders `DraftReadyToast` component above FABs

### Draft Screen (`apps/mobile/app/(app)/draft/[id].tsx`)
- Imports `confidenceTier` from confidence utility
- Added `flatListRef` for FlatList
- `renderItem` computes `displayTier` and passes `confidence` prop to `LineItemRow`
- `onScrollToIndexFailed` handler with offset fallback
- Auto-scroll effect: fires once on initial load (`lineItems.length` dependency), scrolls to first `needs_input` item at `viewPosition: 0.3`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are wired to real AI pipeline output.

## Self-Check

- [x] `apps/mobile/src/utils/confidence.ts` — created
- [x] `apps/mobile/src/utils/confidence.test.ts` — created, 10 tests passing
- [x] `apps/mobile/src/components/voice/draft-ready-toast.tsx` — created
- [x] `apps/mobile/src/utils/line-items.ts` — updated with confidence field + clear on edit
- [x] `apps/mobile/src/components/quotes/line-item-row.tsx` — updated with badge rendering
- [x] `apps/mobile/app/(app)/draft/[id].tsx` — updated with confidence wiring + auto-scroll
- [x] `apps/mobile/app/(app)/quotes.tsx` — updated with DraftReadyToast
- [x] Commit aed7275 — Task 1
- [x] Commit 6a561b2 — Task 2
- [x] TypeScript: only pre-existing expo-av type error, no new errors

## Self-Check: PASSED
