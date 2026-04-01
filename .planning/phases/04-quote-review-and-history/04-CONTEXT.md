# Phase 4: Quote Review and History - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Contractor can create a quote draft manually, edit its line items (quantity, price, add/remove), enter a customer phone number, and send — with pre-send validation blocking until requirements are met. All past quotes (draft, sent, approved, declined, expired, failed_send) are accessible offline via a history list with full line item detail. No voice pipeline in this phase — that is Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Draft entry flow
- **D-01:** FAB on the Quotes tab creates a new `quote` record (status: `draft_local`) and an empty `draft` record in WatermelonDB, then navigates to the draft review screen. Contractor manually picks catalog items.
- **D-02:** Phase 5 voice pipeline slots in by writing to the same WatermelonDB quote/draft records — the draft review screen requires no changes to work with AI-generated drafts.
- **D-03:** The draft review screen is reachable by: (a) creating via FAB, or (b) tapping a `draft_local` row in the history list.

### Tab structure
- **D-04:** One new "Quotes" tab added to the existing bottom tab bar (Home, Catalog, **Quotes** = 3 tabs total).
- **D-05:** The Quotes tab IS the history list — all quotes sorted by recency. No separate "History" tab.
- **D-06:** Row tap behavior depends on status: `draft_local` → opens editable draft review screen; `sent | approved | declined | expired | failed_send` → opens read-only quote detail screen.
- **D-07:** FAB on the Quotes tab creates a new blank draft (D-01). FAB is hidden or disabled on the read-only detail screen.

### Line item editing UX
- **D-08:** Each line item row in the draft review screen shows: item name (left), inline +/- stepper for quantity (center), price (right, tappable).
- **D-09:** Tapping the price opens a compact bottom sheet with a single number input (dollar-formatted, stored as cents), Save/Cancel. Same price-as-cents pattern as catalog.
- **D-10:** Swipe left on a line item row reveals a red Delete action (same gesture pattern as catalog swipe-to-archive).
- **D-11:** "Add item" button at the bottom of the line items list opens a catalog picker bottom sheet — contractor selects from their active catalog items. Selected item appended to the draft with quantity 1.
- **D-12:** Every line item edit (quantity change, price change, delete, add) auto-saves to WatermelonDB immediately via `database.write()` — no Save button for individual edits (REVIEW-05: auto-save on every edit).

### Customer phone + Send
- **D-13:** Sticky footer at the bottom of the draft review screen contains: phone number input field + Send button.
- **D-14:** Send button is disabled until: (a) ≥1 line item exists AND (b) phone input is a valid phone number (10 digits US, or non-empty with basic format check). Pre-send validation fires on button press attempt if not met (REVIEW-06).
- **D-15:** Phone number stored as text string on the `quotes` record (`customer_phone` column, already in schema).

### Quote history list
- **D-16:** Each history row shows: customer phone number (left), status badge (colored chip, e.g., "Draft", "Sent", "Approved", "Declined"), total price formatted as dollars (right), relative date below phone (e.g., "2 days ago"). No customer name — schema only has phone.
- **D-17:** Status badge colors follow existing theme tokens: `draft_local/draft_queued` → accent (#0066cc), `sent` → mutedText (#666666), `approved` → green (new token needed), `declined/expired/failed_send` → destructive (#dc2626).
- **D-18:** History list uses WatermelonDB `observe()` subscription (same pattern as catalog) — offline-first, reactive.

### Backend
- **D-19:** New migration needed: `quotes` and `quote_line_items` tables in Postgres. WatermelonDB `quotes`/`drafts` schema already exists — backend needs to match for sync.
- **D-20:** Quote line items stored as snapshot (name + unit_price_cents baked in at send time) — never FK to catalog_items. This matches the `line_items_json` approach in the `drafts` table and the architecture decision that `quote_line_items` is write-once.
- **D-21:** Backend endpoints needed: `POST /quotes` (create draft), `PUT /quotes/:id` (update draft — customer phone, status), `GET /quotes` (history list), `GET /quotes/:id` (full detail with line items).

### Claude's Discretion
- Exact animation/transition for the draft review screen navigation
- Loading skeleton design for history list
- Catalog picker bottom sheet search/filter behavior (since catalog can have 10-30 items, a flat scrollable list is probably fine without search)
- Error state design for failed send validation (inline vs toast)
- Exact green color token value for "approved" status badge

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — REVIEW-01 through REVIEW-06, HIST-01 through HIST-04 define all acceptance criteria for this phase

### Architecture
- `.planning/PROJECT.md` — Key decisions: prices in integer cents, `quote_snapshots` write-once (DB trigger), `quote_line_items` stores name/price snapshots (never FKs to catalog), offline-first non-negotiable

### Existing WatermelonDB schema
- `apps/mobile/src/db/schema.ts` — `quotes` and `drafts` tables with all columns; `line_items_json` JSON format comment: `Array<{ catalogItemId: string, name: string, quantity: number, unitPriceCents: number }>`
- `apps/mobile/src/db/models/quote.ts` — Quote WatermelonDB model (status, customerPhone, totalCents, sentAt)
- `apps/mobile/src/db/models/draft.ts` — Draft WatermelonDB model (quoteId, lineItemsJson, notes, updatedAt)

### Existing patterns to follow
- `apps/mobile/app/(app)/catalog.tsx` — Full example of observe() subscription, enqueue() calls, bottom sheet pattern, section list, swipe gesture — replicate this pattern for the Quotes tab
- `apps/mobile/app/(app)/_layout.tsx` — Tab navigator to extend with Quotes tab
- `apps/mobile/src/theme/tokens.ts` — All colors, spacing, typography, MIN_TOUCH_TARGET (44) must be respected
- `apps/mobile/src/sync/sync-queue.ts` — enqueue() with entity_type `quote` and `draft` for sync
- `apps/mobile/src/api/client.ts` — API client with auth token handling

### Backend patterns
- `apps/backend/src/routes/catalog.ts` — Express Router + authenticateToken middleware + raw SQL via query() — replicate for quotes route
- `apps/backend/src/db/migrations/002_catalog_items.sql` — Migration format to follow for quotes/quote_line_items tables

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ItemFormSheet` (catalog): bottom sheet with single field editing — adapt for price-edit bottom sheet in draft review
- `UndoToast` (catalog): toast notification — reuse for any draft-level feedback
- `CatalogRow` + swipe gesture: same swipe-left-to-delete pattern needed on line item rows
- `EmptyState` (catalog): adapt for empty draft (no line items yet) and empty history list
- WatermelonDB `observe()` pattern: established, use for both history list and draft review
- `enqueue()`: already accepts `quote` and `draft` entity types (confirmed in schema comments)
- Theme tokens: colors, spacing, typography, MIN_TOUCH_TARGET=44 — all needed

### Established Patterns
- WatermelonDB-first writes: `database.write()` → `enqueue()` — same flow for all quote/draft mutations
- Prices as integer cents: dollar formatting for display, integer storage
- `StyleSheet.create()` with inline styles — no shared design system
- Functional components with hooks (no class components)
- Zustand `useAuthStore` for contractor ID/trade

### Integration Points
- `apps/mobile/app/(app)/_layout.tsx` — add `quotes` Tabs.Screen (new file: `app/(app)/quotes.tsx`)
- `apps/mobile/app/(app)/quotes.tsx` — new history list screen (Quotes tab root)
- Draft review screen: new file (likely `app/(app)/draft/[id].tsx` or a modal overlay)
- `apps/backend/src/server.ts` — mount new quotes route
- New migration file: `apps/backend/src/db/migrations/003_quotes.sql`

</code_context>

<specifics>
## Specific Ideas

- Contractors use phones with dirty/gloved hands — MIN_TOUCH_TARGET=44 must be respected on all interactive elements, especially the +/- stepper buttons on line item rows (44pt minimum).
- The +/- stepper is the most-used interaction (quantity adjustments) — prioritize large, easy-to-hit tap targets over compact design.
- History list should load instantly from WatermelonDB (no loading state needed for offline-first reads).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-quote-review-and-history*
*Context gathered: 2026-04-01*
