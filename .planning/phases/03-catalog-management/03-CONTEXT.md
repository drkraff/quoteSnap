# Phase 3: Catalog Management - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Contractor can own and maintain their service catalog from the phone: add, edit, archive items; view all active items grouped by trade category; changes sync to server when connectivity returns. All data available offline via WatermelonDB.

</domain>

<decisions>
## Implementation Decisions

### Catalog list layout
- **D-01:** SectionList grouped by trade category with sticky section headers
- **D-02:** Simple rows — item name + formatted price on left, unit badge on right. No cards, no thumbnails. Dense and scannable for 10-30 item catalogs.
- **D-03:** Empty state when no items exist: friendly message + "Add your first item" CTA button
- **D-04:** Search/filter is out of scope for MVP (small catalog sizes don't justify it)

### Add/edit interaction
- **D-05:** Bottom sheet modal for both add and edit (keeps list context visible behind the sheet)
- **D-06:** Fields: name (text input), unit (picker with options: each, hour, foot, sqft, job), price (dollar-formatted input that stores as integer cents)
- **D-07:** Price input displays as dollars (e.g., "$125.00") but persists as cents (12500) per architecture decision
- **D-08:** Validation: name required (non-empty), price required (> 0), unit required. Inline error messages below fields.
- **D-09:** Save button disabled until form is valid. On save: write to WatermelonDB immediately + enqueue sync.

### Archive experience
- **D-10:** Swipe-to-archive gesture (swipe left reveals red archive action)
- **D-11:** Undo toast shown for 3 seconds after archive — tapping "Undo" restores the item. No confirmation dialog before archive.
- **D-12:** No "view archived items" screen in MVP. Archived items are simply hidden from the active list and AI mapping. Data is retained in WatermelonDB and Postgres.

### Navigation structure
- **D-13:** Bottom tab bar navigator replaces the current Stack-only (app) layout
- **D-14:** Two tabs for now: Home (existing placeholder), Catalog (new). Future phases add Quotes and History tabs.
- **D-15:** Catalog tab opens directly to the grouped list screen. Add/edit is a modal overlay, not a separate stack screen.

### Sync behavior
- **D-16:** Every catalog mutation (add, edit, archive) writes to WatermelonDB first, then enqueues a sync item via existing `enqueue()` with entity_type `catalog_item`
- **D-17:** Backend CRUD endpoints: GET /catalog (list active), POST /catalog (create), PUT /catalog/:id (update), PATCH /catalog/:id/archive (archive). All behind `authenticateToken`.
- **D-18:** Sync queue `processQueue()` TODO placeholder gets wired to actual API calls for catalog_item entity type in this phase (not deferred to Phase 7)

### Claude's Discretion
- Exact styling (colors, spacing, typography, shadows) — will follow a clean minimal pattern consistent with existing screens
- Loading skeleton design for catalog list
- Bottom sheet library choice (or custom implementation)
- Exact swipe gesture library/implementation
- Tab bar icon choices
- Animation/transition details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above and the following project files:

### Requirements
- `.planning/REQUIREMENTS.md` — CAT-01 through CAT-06 define the catalog management requirements

### Architecture
- `.planning/PROJECT.md` — Key decisions: prices in integer cents, offline-first non-negotiable, catalog-constraint architecture

### Existing code
- `apps/mobile/src/db/models/catalog-item.ts` — WatermelonDB CatalogItem model (all fields already defined)
- `apps/mobile/src/db/schema.ts` — WatermelonDB schema including catalog_items table
- `apps/backend/src/db/migrations/002_catalog_items.sql` — Postgres catalog_items table schema
- `apps/mobile/src/sync/sync-queue.ts` — Sync queue with enqueue() supporting catalog_item entity type
- `apps/mobile/src/api/client.ts` — API client with auth token handling and 401 auto-refresh
- `apps/backend/src/routes/onboarding.ts` — Example backend route pattern (Express router + authenticateToken middleware)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CatalogItem` WatermelonDB model: fully defined with serverId, contractorId, name, unit, unitPriceCents, tradeCategory, isArchived
- `sync-queue.ts` `enqueue()`: accepts `catalog_item` entity type with create/update/delete actions
- `apiClient`: GET/POST/PUT/DELETE with auth token injection and 401 auto-refresh
- `authenticateToken` middleware: extracts contractor ID from JWT for backend routes

### Established Patterns
- Backend: Express Router + `authenticateToken` + raw SQL via `query()` helper (no ORM)
- Mobile state: Zustand stores (see `auth-store.ts`)
- Navigation: expo-router file-based routing with `(app)` and `(auth)` groups
- Styling: inline `StyleSheet.create()` — no shared design system or theme

### Integration Points
- `apps/mobile/app/(app)/_layout.tsx` — needs to change from Stack to Tab navigator
- `apps/mobile/app/(app)/index.tsx` — becomes the Home tab content
- New route file needed: `apps/backend/src/routes/catalog.ts` — mounted in server.ts
- `sync-queue.ts` `processQueue()` — needs actual API call implementation for catalog_item

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Key user context: contractors on job sites with dirty/gloved hands need large tap targets and fast interactions. Minimize taps to complete common actions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-catalog-management*
*Context gathered: 2026-03-28*
