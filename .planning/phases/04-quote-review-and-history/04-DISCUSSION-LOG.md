# Phase 4: Quote Review and History - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 04-quote-review-and-history
**Areas discussed:** Draft entry flow, Tab structure, Line item editing UX, Customer phone + Send flow

---

## Draft entry flow

| Option | Description | Selected |
|--------|-------------|----------|
| FAB creates blank draft | FAB on Quotes tab creates new quote (draft_local) + empty draft in WatermelonDB, navigates to review screen | ✓ |
| Manual item-picking mode | Contractor picks catalog items directly to build a draft | (merged into selected) |
| Phase 4 only edits existing drafts | Draft creation deferred to Phase 5 voice pipeline | |

**User's choice:** Claude recommended FAB creates blank draft + manual item picking. User confirmed with "All good."
**Notes:** Phase 5 voice pipeline slots in by writing to the same WatermelonDB records — no changes needed to the review screen.

---

## Tab structure

| Option | Description | Selected |
|--------|-------------|----------|
| One "Quotes" tab | History list IS the Quotes tab. Row tap opens draft or read-only detail based on status. | ✓ |
| Two separate tabs | "Active/Draft" tab + "History" tab | |

**User's choice:** Claude recommended one combined Quotes tab. User confirmed with "All good."
**Notes:** Keeps tab count at 3 (Home, Catalog, Quotes). D-14 from Phase 3 anticipated this.

---

## Line item editing UX

| Option | Description | Selected |
|--------|-------------|----------|
| Inline stepper + price modal | +/- stepper for quantity inline; tap price opens compact bottom sheet | ✓ |
| Bottom sheet per line item | Same pattern as catalog ItemFormSheet — drill into sheet to edit | |
| Swipe reveals edit/delete | Swipe left reveals Edit + Delete actions | (swipe for delete only) |

**User's choice:** Claude recommended inline stepper + price modal + swipe-to-delete. User confirmed with "All good."
**Notes:** Swipe-left reveals delete only (not edit) — consistent with catalog swipe-to-archive pattern.

---

## Customer phone + Send flow

| Option | Description | Selected |
|--------|-------------|----------|
| Sticky footer on draft screen | Phone input + Send button fixed at bottom of draft review screen | ✓ |
| Modal on Send tap | Modal/sheet appears when contractor taps Send | |
| Separate screen | Phone entry as a separate navigation step | |

**User's choice:** Claude recommended sticky footer. User confirmed with "All good."
**Notes:** Minimizes taps for on-site gloved-hand use. Send button disabled until ≥1 line item + valid phone.

---

## Claude's Discretion

- Exact animation/transition for draft screen navigation
- Loading skeleton for history list
- Catalog picker bottom sheet search behavior
- Error state design for send validation failure
- Exact green color token value for "approved" badge

## Deferred Ideas

None.
