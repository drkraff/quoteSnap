---
phase: 04-quote-review-and-history
plan: "02"
subsystem: mobile-ui
tags: [components, react-native, quotes, ui]
dependency_graph:
  requires:
    - apps/mobile/src/theme/tokens.ts
    - apps/mobile/src/db/models/quote.ts
    - react-native-gesture-handler
    - "@expo/vector-icons"
  provides:
    - apps/mobile/src/components/quotes/status-badge.tsx
    - apps/mobile/src/components/quotes/quote-row.tsx
    - apps/mobile/src/components/quotes/quote-detail.tsx
    - apps/mobile/src/components/quotes/line-item-row.tsx
    - apps/mobile/src/components/quotes/price-edit-sheet.tsx
    - apps/mobile/src/components/quotes/catalog-picker-sheet.tsx
    - apps/mobile/src/utils/format-relative-date.ts
  affects:
    - apps/mobile/src/theme/tokens.ts
tech_stack:
  added:
    - format-relative-date utility (vanilla JS date math, no date-fns dependency)
  patterns:
    - Swipeable right-action (react-native-gesture-handler) — copied from catalog-row
    - Modal bottom sheet (slide + transparent overlay) — copied from item-form-sheet
    - StyleSheet.create with tokens import
key_files:
  created:
    - apps/mobile/src/components/quotes/status-badge.tsx
    - apps/mobile/src/components/quotes/quote-row.tsx
    - apps/mobile/src/components/quotes/quote-detail.tsx
    - apps/mobile/src/components/quotes/line-item-row.tsx
    - apps/mobile/src/components/quotes/price-edit-sheet.tsx
    - apps/mobile/src/components/quotes/catalog-picker-sheet.tsx
    - apps/mobile/src/utils/format-relative-date.ts
  modified:
    - apps/mobile/src/theme/tokens.ts
decisions:
  - "format-relative-date implemented with vanilla Date math — avoids date-fns dependency for a simple 4-tier relative date format"
  - "tokens.ts extended with success color and display typography in this plan (were referenced as added in Plan 01 but were missing)"
metrics:
  duration: "3m"
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_created: 7
  files_modified: 1
requirements:
  - REVIEW-01
  - REVIEW-02
  - REVIEW-03
  - REVIEW-08
  - HIST-03
---

# Phase 4 Plan 02: Quote UI Components Summary

6 reusable UI components for the quotes feature plus a date utility, built as a self-contained component library for screen integration in Plan 03.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | StatusBadge + QuoteRow + QuoteDetail | 9cee6e7 | status-badge.tsx, quote-row.tsx, quote-detail.tsx, tokens.ts, format-relative-date.ts |
| 2 | LineItemRow + PriceEditSheet + CatalogPickerSheet | 2c61d17 | line-item-row.tsx, price-edit-sheet.tsx, catalog-picker-sheet.tsx |

## What Was Built

### StatusBadge
Colored pill badge for all 7 quote statuses (`draft_local`, `draft_queued`, `sent`, `approved`, `declined`, `expired`, `failed_send`). Self-contained `Record<string, StatusConfig>` color map. borderRadius 4, 8px horizontal / 4px vertical padding, 14px/700 label text.

### QuoteRow
History list row. Left column: customer phone (body 16/400, "No phone" fallback) + relative date (label 14/400, mutedText). Center: StatusBadge. Right: total as `$X.XX` (display 20/700). 56px min height, 16px padding, bottom border.

### QuoteDetail
Read-only detail view. Header: StatusBadge, phone, created date, sent date (if present). FlatList of line items (name, `x{qty}`, item total). Footer: total label + amount. No interactive elements — suitable for sent/approved/declined/expired quotes.

### LineItemRow
Swipeable row (react-native-gesture-handler). Left: item name (flex 1, ellipsize). Center: `remove-circle-outline` / qty text / `add-circle-outline` stepper, 44px touch targets, minus disabled (opacity 0.4) at qty=1. Right: price Pressable (44px min height). Red swipe-to-delete action with trash icon.

### PriceEditSheet
Modal bottom sheet. Pre-filled TextInput (`decimal-pad`), focused border highlight, inline error "Price must be greater than $0.00". Discard (text-only) / Update Price (accent bg) button row. KeyboardAvoidingView for iOS/Android.

### CatalogPickerSheet
Modal bottom sheet. FlatList of `{ id, name, unitPriceCents }` items. Tap row: calls `onSelect(item)` then `onDismiss()`. Empty state: "No catalog items available". maxHeight 60% screen height.

### format-relative-date utility
`formatRelativeDate(date)` — returns "N minutes ago" / "N hours ago" / "N days ago" / locale date string for dates older than 7 days. No external dependencies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing tokens to tokens.ts**
- **Found during:** Task 1 setup
- **Issue:** `tokens.ts` was missing `colors.success` and `typography.display` which the plan spec explicitly stated were added in Plan 01. Components reference both — without them TypeScript would fail.
- **Fix:** Added `success: '#16a34a'` to colors and `display: { fontSize: 20, fontWeight: '700', lineHeight: 26 }` to typography.
- **Files modified:** `apps/mobile/src/theme/tokens.ts`
- **Commit:** 9cee6e7

**2. [Rule 2 - Missing functionality] Created format-relative-date utility**
- **Found during:** Task 1 — QuoteRow requires `formatRelativeDate` but no utility existed
- **Issue:** `src/utils/` directory and the utility referenced in the plan did not exist
- **Fix:** Created `apps/mobile/src/utils/format-relative-date.ts` with vanilla Date math (no date-fns)
- **Files created:** `apps/mobile/src/utils/format-relative-date.ts`
- **Commit:** 9cee6e7

## Known Stubs

None. All components receive data via props — no hardcoded empty values or placeholder data flow.

## Self-Check: PASSED
