# Phase 4: Quote Review and History - Research

**Researched:** 2026-04-01
**Domain:** React Native / Expo Router (mobile) + Express/Postgres (backend) — WatermelonDB offline-first CRUD screens
**Confidence:** HIGH

## Summary

Phase 4 adds the Quotes tab (history list + FAB), an editable draft review screen, and the backend endpoints that back them. Every decision is already locked in CONTEXT.md: screen files, navigation structure, data shape, UX gestures, and backend schema. The research goal is to confirm the exact implementation details those decisions depend on so the planner can write precise task instructions without ambiguity.

The entire mobile side follows the pattern established in `catalog.tsx`: WatermelonDB `observe()` subscription, `database.write()` + `enqueue()` for mutations, `Swipeable` for swipe gestures, a `Modal` bottom sheet for sub-forms, and `StyleSheet.create()` with tokens. The draft review screen introduces one new pattern — inline +/- steppers and a sticky footer — but both can be built from the same primitives already in the repo.

The backend side follows `catalog.ts` exactly: Express Router, `authenticateToken` middleware, raw SQL via `query()`, a `rowToResponse` mapper. The migration follows `002_catalog_items.sql` format. The only novel element is the `quote_line_items` table, which must store a write-once name/price snapshot (never FK to catalog_items) per the architecture decision.

**Primary recommendation:** Replicate catalog.tsx patterns faithfully — do not introduce new libraries or patterns. The codebase is internally consistent; keep it that way.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Draft entry flow**
- D-01: FAB on the Quotes tab creates a new `quote` record (status: `draft_local`) and an empty `draft` record in WatermelonDB, then navigates to the draft review screen. Contractor manually picks catalog items.
- D-02: Phase 5 voice pipeline slots in by writing to the same WatermelonDB quote/draft records — the draft review screen requires no changes to work with AI-generated drafts.
- D-03: The draft review screen is reachable by: (a) creating via FAB, or (b) tapping a `draft_local` row in the history list.

**Tab structure**
- D-04: One new "Quotes" tab added to the existing bottom tab bar (Home, Catalog, Quotes = 3 tabs total).
- D-05: The Quotes tab IS the history list — all quotes sorted by recency. No separate "History" tab.
- D-06: Row tap behavior depends on status: `draft_local` → opens editable draft review screen; `sent | approved | declined | expired | failed_send` → opens read-only quote detail screen.
- D-07: FAB on the Quotes tab creates a new blank draft (D-01). FAB is hidden or disabled on the read-only detail screen.

**Line item editing UX**
- D-08: Each line item row shows: item name (left), inline +/- stepper for quantity (center), price (right, tappable).
- D-09: Tapping the price opens a compact bottom sheet with a single number input (dollar-formatted, stored as cents), Save/Cancel.
- D-10: Swipe left on a line item row reveals a red Delete action (same gesture pattern as catalog swipe-to-archive).
- D-11: "Add item" button at the bottom of the line items list opens a catalog picker bottom sheet — flat scrollable list of active catalog items. Selected item appended with quantity 1.
- D-12: Every line item edit auto-saves to WatermelonDB immediately via `database.write()` — no Save button for individual edits.

**Customer phone + Send**
- D-13: Sticky footer at the bottom of the draft review screen contains: phone number input field + Send button.
- D-14: Send button is disabled until ≥1 line item AND phone is a valid 10-digit US number (or non-empty with basic format check).
- D-15: Phone stored as text string on `quotes.customer_phone`.

**Quote history list**
- D-16: Each history row shows: customer phone (left), status badge (colored chip), total price (right), relative date below phone (e.g., "2 days ago").
- D-17: Status badge colors — `draft_local/draft_queued` → accent (#0066cc), `sent` → mutedText (#666666), `approved` → green (new token needed), `declined/expired/failed_send` → destructive (#dc2626).
- D-18: History list uses WatermelonDB `observe()` subscription — offline-first, reactive.

**Backend**
- D-19: New migration: `quotes` and `quote_line_items` tables in Postgres. WatermelonDB schema already exists.
- D-20: Quote line items stored as snapshot (name + unit_price_cents baked in at send time) — never FK to catalog_items.
- D-21: Backend endpoints: `POST /quotes`, `PUT /quotes/:id`, `GET /quotes`, `GET /quotes/:id`.

### Claude's Discretion
- Exact animation/transition for the draft review screen navigation
- Loading skeleton design for history list
- Catalog picker bottom sheet search/filter behavior (flat scrollable list is fine without search)
- Error state design for failed send validation (inline vs toast)
- Exact green color token value for "approved" status badge

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVIEW-01 | Contractor can view draft as list of line items with quantities and prices | WatermelonDB `observe()` on `drafts` table, parse `line_items_json`, render FlatList |
| REVIEW-02 | Contractor can edit any line item (quantity, price) | +/- stepper writes to `line_items_json` via `database.write()`; price bottom sheet (Modal pattern from `ItemFormSheet`) |
| REVIEW-03 | Contractor can remove a line item from the draft | Swipeable right-action pattern from `CatalogRow`; filter item from parsed JSON and write back |
| REVIEW-04 | Contractor can add a catalog item manually to the draft | Catalog picker bottom sheet queries `catalog_items` where `is_archived=false`; appends to `line_items_json` |
| REVIEW-05 | Draft auto-saves locally on every edit (no data loss) | Every mutation calls `database.write()` immediately — no buffering, no separate Save |
| REVIEW-06 | Pre-send validation: ≥1 line item AND valid phone before Send | Derived boolean from state; Send `Pressable` disabled prop + inline error on press attempt |
| HIST-01 | All quote states persisted locally in WatermelonDB | Schema already has `status` column with all 7 values; no schema change needed on mobile |
| HIST-02 | Contractor can view history list sorted by recency | `observe()` on `quotes` with `Q.sortBy('created_at', 'desc')` |
| HIST-03 | Contractor can open a past quote to view full line items and status | Read-only detail screen; for sent/approved/etc., fetch line items from backend or from future `quote_line_items` local table (backend GET /quotes/:id returns snapshot) |
| HIST-04 | Quote history accessible offline | WatermelonDB observe() is fully offline — zero network dependency for reads |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nozbe/watermelondb | already installed | Local SQLite read/write, reactive observe() | Established in Phase 1; all offline-first data |
| expo-router | already installed | File-based navigation; `app/(app)/quotes.tsx`, `app/(app)/draft/[id].tsx` | Established routing system |
| react-native-gesture-handler | already installed | `Swipeable` for swipe-to-delete on line item rows | Already used in CatalogRow |
| @expo/vector-icons (Ionicons) | already installed | Tab icons, row icons, close buttons | Used throughout existing screens |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React Native `Modal` | built-in | Price edit bottom sheet, catalog picker bottom sheet | Same pattern as `ItemFormSheet` |
| React Native `FlatList` | built-in | Line items list (ordered, no sections needed) and catalog picker list | Simpler than SectionList; no grouping needed here |
| date-fns or Intl.RelativeTimeFormat | — | Relative dates on history rows ("2 days ago") | See Pitfall 3 below — check what's available before adding |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Modal for bottom sheets | `@gorhom/bottom-sheet` | More native feel but adds dependency; Modal works and is already proven in ItemFormSheet |
| FlatList for line items | SectionList | No sections needed in draft review; FlatList is simpler |
| Plain JS date math | date-fns | date-fns is smaller and more reliable; only install if not already present |

**Installation:** No new packages expected. Verify date formatting library before adding one.

**Version verification:** All packages are already installed as part of the monorepo. No new installs required unless a date formatting utility is absent from `package.json`.

---

## Architecture Patterns

### Recommended Project Structure
```
apps/mobile/
├── app/(app)/
│   ├── quotes.tsx                  # Quotes tab root — history list + FAB
│   └── draft/
│       └── [id].tsx                # Draft review screen (editable)
│   (no separate read-only detail screen needed — see pattern below)
├── src/components/quotes/
│   ├── quote-row.tsx               # History list row (phone, badge, total, date)
│   ├── status-badge.tsx            # Colored chip for quote status
│   ├── line-item-row.tsx           # Name + stepper + price, swipeable
│   ├── price-edit-sheet.tsx        # Compact bottom sheet for price editing
│   ├── catalog-picker-sheet.tsx    # Bottom sheet for picking catalog items
│   └── quote-detail.tsx            # Read-only detail view (reused in read-only route)
├── src/api/
│   └── quotes.ts                   # API functions: createQuote, updateQuote, getQuotes, getQuote
apps/backend/src/
├── db/migrations/
│   └── 003_quotes.sql              # quotes + quote_line_items tables
├── routes/
│   └── quotes.ts                   # POST, PUT, GET /, GET /:id
└── types/
    └── quotes.ts                   # QuoteResponse, QuoteLineItemResponse types
```

**Note on read-only detail screen:** D-06 says non-draft status taps open a read-only detail screen. The simplest approach is a second route `app/(app)/quote/[id].tsx` (read-only) that reuses `QuoteDetail` component. Alternatively, the draft/[id].tsx screen can accept a `readonly` query param. Claude's discretion — document choice in STATE.md when decided.

### Pattern 1: WatermelonDB observe() subscription (replicate from catalog.tsx)
**What:** Subscribe to a live query in `useEffect`, update state on every DB change, unsubscribe on cleanup.
**When to use:** Every list that must update without manual refresh (history list, line items list inside draft screen).
**Example:**
```typescript
// Source: apps/mobile/app/(app)/catalog.tsx lines 54-69
useEffect(() => {
  const collection = database.get<Quote>('quotes');
  const query = collection.query(
    Q.where('contractor_id', contractorId),
    Q.sortBy('created_at', 'desc'),
  );
  const subscription = query.observe().subscribe((results) => {
    setQuotes(results);
  });
  return () => subscription.unsubscribe();
}, []);
```

### Pattern 2: database.write() + enqueue() mutation
**What:** Every mutation writes to WatermelonDB first (offline-safe), then enqueues to sync queue.
**When to use:** All quote/draft mutations — create draft, update line items, update phone, update status.
**Example:**
```typescript
// Source: apps/mobile/app/(app)/catalog.tsx lines 100-148
await database.write(async () => {
  await record.update((r) => {
    r.someField = newValue;
  });
});
await enqueue({
  entityType: 'draft',
  entityId: draft.id,
  action: 'update',
  payload: { lineItemsJson: JSON.stringify(updatedItems) },
});
```

### Pattern 3: line_items_json mutation
**What:** `drafts.line_items_json` is a JSON string; all edits require parse → mutate → serialize → write.
**When to use:** Every line item change (quantity stepper, price edit, add item, delete item).
**Example:**
```typescript
// Derived from schema comment: Array<{ catalogItemId, name, quantity, unitPriceCents }>
type LineItem = {
  catalogItemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
};

async function updateQuantity(draft: Draft, itemIndex: number, delta: number): Promise<void> {
  const items: LineItem[] = JSON.parse(draft.lineItemsJson || '[]');
  const updated = items.map((item, i) =>
    i === itemIndex ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
  );
  const newTotal = updated.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);

  await database.write(async () => {
    await draft.update((r) => {
      r.lineItemsJson = JSON.stringify(updated);
    });
    await quote.update((r) => {
      r.totalCents = newTotal;
    });
  });
  await enqueue({ entityType: 'draft', entityId: draft.id, action: 'update', payload: { lineItemsJson: JSON.stringify(updated) } });
}
```
**Note:** `quotes.total_cents` must be kept in sync with `drafts.line_items_json` on every mutation. Both writes should be batched inside the same `database.write()` call for atomicity.

### Pattern 4: Swipeable row (replicate from catalog-row.tsx)
**What:** `react-native-gesture-handler` `Swipeable` wraps a row Pressable; `renderRightActions` returns a red delete button.
**When to use:** Line item rows in draft review (D-10).
**Example:**
```typescript
// Source: apps/mobile/src/components/catalog/catalog-row.tsx lines 18-35
function renderRightActions(): JSX.Element {
  return (
    <Pressable
      style={styles.deleteAction}
      onPress={onDelete}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${item.name}`}
    >
      <Ionicons name="trash-outline" size={24} color="#ffffff" />
    </Pressable>
  );
}
return (
  <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
    {/* row content */}
  </Swipeable>
);
```

### Pattern 5: Modal bottom sheet (replicate from item-form-sheet.tsx)
**What:** `Modal` with `animationType="slide"` and `transparent={true}`, positioned via `justifyContent: 'flex-end'`. Handle, header with close X, scrollable content, `KeyboardAvoidingView`.
**When to use:** Price edit sheet (D-09) and catalog picker sheet (D-11). Both are simpler than the full `ItemFormSheet` — price sheet has a single input; picker sheet has a scrollable list.
**Key implementation details from source:**
- Overlay: `backgroundColor: 'rgba(0,0,0,0.5)'`, `justifyContent: 'flex-end'`
- Sheet: `borderTopLeftRadius: 16`, `borderTopRightRadius: 16`, `maxHeight: screenHeight * 0.8`
- Drag handle: `width: 32, height: 4, backgroundColor: colors.border, borderRadius: 2`
- `KeyboardAvoidingView` with `behavior: Platform.OS === 'ios' ? 'padding' : 'height'`

### Pattern 6: Backend Express route (replicate from routes/catalog.ts)
**What:** `Router` + `authenticateToken` + raw SQL via `query()` + typed `rowToResponse` mapper.
**When to use:** All four quote endpoints.
**Key details:**
- Always include `AND contractor_id = $N` in WHERE clauses (row-level ownership check)
- Use `RETURNING` clause to avoid a second SELECT round-trip
- `req.contractor!.contractorId` for the authenticated contractor's UUID

### Anti-Patterns to Avoid
- **Buffering line item edits before writing:** REVIEW-05 requires immediate writes. Never accumulate changes and flush on "Save."
- **Storing line items as individual WatermelonDB records:** The schema stores them as `line_items_json` on the `drafts` table. Adding a separate local table would deviate from the established schema and require a schema version bump.
- **FK from quote_line_items to catalog_items in Postgres:** D-20 explicitly forbids this. Name and price are baked in as a snapshot at send time.
- **Calculating total_cents only on the backend:** `quotes.total_cents` must be maintained locally in WatermelonDB on every edit so the history list can show totals without a network call.
- **Using `withObservables` HOC:** The codebase uses plain `useEffect` + `subscribe()`. Do not introduce `withObservables` — it would be a new pattern inconsistent with existing screens.
- **Skipping GestureHandlerRootView:** The app root already wraps in `GestureHandlerRootView` (fixed in Phase 3, commit b6276a0). Do not add another wrapper inside the quotes screens.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reactive list that updates on DB change | Custom polling/event bus | WatermelonDB `observe()` | Already proven; handles all edge cases including background writes |
| Swipe-to-delete gesture | Raw PanResponder | `react-native-gesture-handler` `Swipeable` | Already used; handles gesture conflicts, accessibility |
| Bottom sheet | Custom animated View | `Modal` with `animationType="slide"` | Same pattern as `ItemFormSheet`; no new library needed |
| Price input (dollar display, cents storage) | Custom formatter | Copy the `handlePriceChange` logic from `ItemFormSheet` | Already handles decimal normalization and cents conversion |
| Relative timestamps | Custom date math | `Intl.RelativeTimeFormat` (built into JS) or `date-fns/formatDistanceToNow` | Edge cases in custom date math are subtle; use a tested utility |
| Phone number validation | Custom regex | Simple 10-digit check is sufficient per D-14; `tel:` URIs accept format variations | D-14 specifies "10 digits US, or non-empty with basic format check" — over-engineering is waste |

**Key insight:** This phase is almost entirely assembly — taking existing components and patterns and wiring them to new data models. The main creative work is the line item row with its stepper, which has no direct analog in catalog.tsx but uses the same primitives (Pressable, View, Text, tokens).

---

## Common Pitfalls

### Pitfall 1: total_cents drift between quotes and drafts
**What goes wrong:** History list shows stale total because `quotes.total_cents` was not updated when `drafts.line_items_json` changed.
**Why it happens:** Two separate records must be kept in sync manually; there is no DB-level computed column in WatermelonDB SQLite.
**How to avoid:** Always update `quotes.total_cents` inside the same `database.write()` call as the `drafts.line_items_json` write. Create a helper function `recalculateTotal(items: LineItem[]): number` and call it in every mutation path.
**Warning signs:** History row total does not match draft review total; total shows $0.00 for non-empty drafts.

### Pitfall 2: Swipeable gesture conflicts inside FlatList
**What goes wrong:** Horizontal swipe on a list item that is inside a scrollable FlatList triggers scroll instead of swipe, or vice versa.
**Why it happens:** React Native's touch system needs to decide which responder "wins" the gesture.
**How to avoid:** Set `directionalLockEnabled={false}` is not needed — `Swipeable` from `react-native-gesture-handler` handles this automatically when wrapped in a `GestureHandlerRootView`. The app root already has this wrapper (Phase 3 fix). No extra config needed.
**Warning signs:** Swipe gesture activates briefly then cancels; swipe only works on slow deliberate swipes.

### Pitfall 3: Relative date formatting
**What goes wrong:** "2 days ago" text renders incorrectly or crashes on certain date values.
**Why it happens:** JS `Date` objects from WatermelonDB `@date` decorators are `Date` instances; WatermelonDB `created_at` is stored as a Unix timestamp (number). Passing a raw number to a date library that expects a `Date` object causes silent wrong output.
**How to avoid:** Confirm the `Quote` model's `createdAt` type — it uses `@readonly @date('created_at')` which returns a `Date`. Pass directly to `date-fns/formatDistanceToNow` or `new Intl.RelativeTimeFormat`. Check whether `date-fns` is already in `package.json` before adding it.
**Warning signs:** Date shows "Invalid Date" or "53 years ago."

### Pitfall 4: FAB creating duplicate drafts on double-tap
**What goes wrong:** Contractor taps FAB twice quickly; two `quote` + `draft` records are created; both appear in history.
**Why it happens:** No debounce or navigation guard on the FAB press handler.
**How to avoid:** Set a `isCreating` boolean ref or state; disable FAB while the `database.write()` + `router.push()` is in flight.
**Warning signs:** History list shows duplicate Draft entries with the same timestamp.

### Pitfall 5: Keyboard obscures sticky footer on Android
**What goes wrong:** When the phone number `TextInput` in the sticky footer is focused, the software keyboard slides up and covers the Send button.
**Why it happens:** Android's default `windowSoftInputMode` (`adjustResize`) does not account for sticky footers the same way iOS `padding` mode does.
**How to avoid:** Wrap the draft review screen content in `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`. Test on Android emulator with keyboard open.
**Warning signs:** Send button not visible when phone input is focused on Android.

### Pitfall 6: sync-queue.ts throws "Unhandled entity type" for quote/draft
**What goes wrong:** Enqueuing `quote` or `draft` entities causes the queue processor to throw an error at runtime because `pushToServer` only handles `catalog_item` today (lines 82-83 of `sync-queue.ts`).
**Why it happens:** Phase 3 left `quote` and `draft` as registered types but with a throw placeholder.
**How to avoid:** Phase 4 must add `quote` and `draft` branches to `pushToServer()` in `sync-queue.ts`. This is a required task — it is not optional.
**Warning signs:** Sync queue shows `failed` status immediately after enqueuing; console error "Unhandled entity type: quote."

### Pitfall 7: Read-only detail screen trying to render line items from WatermelonDB
**What goes wrong:** Read-only quote detail screen for `sent/approved/declined` quotes has no `drafts` record to read from (draft may have been cleared or never existed locally after sync).
**Why it happens:** The `drafts` table is a local working copy. Once a quote is sent, the canonical line items live in `quote_line_items` on the backend. WatermelonDB may not have a matching `draft` record on a fresh install.
**How to avoid:** For non-draft quotes, the read-only detail screen must fetch line items from `GET /quotes/:id` (backend endpoint D-21) and render them from API response, not WatermelonDB. Cache the result in local state for the session. A network-unavailable state (offline) should render whatever was last cached or show a "Connect to view full details" message. This does NOT violate HIST-04 because HIST-04 requires the history list (not full detail) to work offline.
**Warning signs:** Read-only detail shows empty line items; crashes with null reference on `draft.lineItemsJson`.

---

## Code Examples

### History list observe() — quotes.tsx
```typescript
// Pattern: replicate catalog.tsx observe() but on 'quotes' sorted by created_at desc
useEffect(() => {
  const contractorId = useAuthStore.getState().contractor?.id ?? '';
  const collection = database.get<Quote>('quotes');
  const subscription = collection
    .query(
      Q.where('contractor_id', contractorId),
      Q.sortBy('created_at', 'desc'),
    )
    .observe()
    .subscribe(setQuotes);
  return () => subscription.unsubscribe();
}, []);
```

### FAB creates new draft — quotes.tsx
```typescript
// Source pattern: database.write() create flow from catalog.tsx lines 119-146
async function handleFabPress(): Promise<void> {
  if (isCreating) return;
  setIsCreating(true);
  try {
    const contractorId = useAuthStore.getState().contractor?.id ?? '';
    const quoteCollection = database.get<Quote>('quotes');
    const draftCollection = database.get<Draft>('drafts');

    let newQuoteId: string;
    await database.write(async () => {
      const newQuote = await quoteCollection.create((r) => {
        r.contractorId = contractorId;
        r.status = 'draft_local';
        r.totalCents = 0;
      });
      newQuoteId = newQuote.id;
      await draftCollection.create((r) => {
        r.quoteId = newQuote.id;
        r.lineItemsJson = '[]';
      });
    });
    router.push(`/draft/${newQuoteId!}`);
  } finally {
    setIsCreating(false);
  }
}
```

### Line item add — draft/[id].tsx
```typescript
// Append catalog item to line_items_json and recalculate total
async function handleAddItem(catalogItem: CatalogItem): Promise<void> {
  const currentItems: LineItem[] = JSON.parse(draft.lineItemsJson || '[]');
  const newItem: LineItem = {
    catalogItemId: catalogItem.id,
    name: catalogItem.name,
    quantity: 1,
    unitPriceCents: catalogItem.unitPriceCents,
  };
  const updated = [...currentItems, newItem];
  const newTotal = updated.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0);

  await database.write(async () => {
    await draft.update((r) => { r.lineItemsJson = JSON.stringify(updated); });
    await quote.update((r) => { r.totalCents = newTotal; });
  });
  await enqueue({ entityType: 'draft', entityId: draft.id, action: 'update', payload: { lineItemsJson: JSON.stringify(updated) } });
}
```

### Send validation — draft/[id].tsx
```typescript
// D-14: disabled until ≥1 item AND valid phone
const lineItems: LineItem[] = JSON.parse(draft?.lineItemsJson ?? '[]');
const phoneIsValid = /^\d{10}$/.test(phone.replace(/\D/g, '')) || phone.trim().length > 0;
const canSend = lineItems.length > 0 && phoneIsValid;

// Pressable
<Pressable
  style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
  onPress={canSend ? handleSend : handleSendBlocked}
  accessibilityState={{ disabled: !canSend }}
>
  <Text style={styles.sendButtonText}>Send</Text>
</Pressable>
```

### Backend migration — 003_quotes.sql
```sql
-- Pattern: follows 002_catalog_items.sql format
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'draft_local',
  customer_phone VARCHAR(20),
  total_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE quote_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO foreign key to catalog_items — snapshot per D-20
);

CREATE INDEX idx_quotes_contractor ON quotes(contractor_id);
CREATE INDEX idx_quote_line_items_quote ON quote_line_items(quote_id);

CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### sync-queue.ts extension — quote/draft branches
```typescript
// Add inside pushToServer() after the catalog_item branch
if (item.entityType === 'quote') {
  if (item.action === 'create') {
    const response = await createQuote(payload);
    const quoteCollection = database.get<Quote>('quotes');
    const localItems = await quoteCollection.query(Q.where('id', item.entityId)).fetch();
    if (localItems[0]) {
      await database.write(async () => {
        await localItems[0].update((r) => { r.serverId = response.id; });
      });
    }
  } else if (item.action === 'update') {
    const quoteCollection = database.get<Quote>('quotes');
    const localItems = await quoteCollection.query(Q.where('id', item.entityId)).fetch();
    const serverId = localItems[0]?.serverId;
    if (!serverId) throw new Error('Cannot sync update: no server ID for quote');
    await updateQuote(serverId, payload);
  }
  return;
}
if (item.entityType === 'draft') {
  // Draft sync updates the parent quote's line items payload on the backend
  const draftCollection = database.get<Draft>('drafts');
  const localDrafts = await draftCollection.query(Q.where('id', item.entityId)).fetch();
  // Look up the quote's serverId via quoteId
  // ... (planner to specify exact lookup chain)
  return;
}
```

### Status badge token — new token needed
```typescript
// Add to apps/mobile/src/theme/tokens.ts
export const colors = {
  // ... existing
  approved: '#16a34a',   // green-600 — Claude's discretion per D-17
} as const;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Redux for local state | WatermelonDB observe() + useState | Phase 1 decision | Reactive without boilerplate; offline-first by default |
| Separate "save draft" button | Auto-save on every edit (REVIEW-05) | Phase 4 requirement | Eliminates data loss on crash; no Save button in UI |
| FK from line items to catalog | Snapshot (name+price baked in) | Architecture decision | Approval page integrity — price changes after send don't affect sent quotes |

**Deprecated/outdated:**
- `withObservables` HOC (from older WatermelonDB docs): this codebase uses plain `useEffect` + `observe().subscribe()` — do not use the HOC pattern.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker quotesnap-db | Backend Postgres | Must be started manually | Postgres 15 (container) | `docker start quotesnap-db` |
| WatermelonDB JSI adapter | Mobile SQLite | Already configured Phase 1 | — | — |
| react-native-gesture-handler | Swipeable rows | Already installed | — | — |
| GestureHandlerRootView | Gesture support | Already wrapped (Phase 3 fix) | — | — |
| date-fns | Relative timestamps | Verify in package.json | — | Use `Intl.RelativeTimeFormat` (zero-dep) |

**Missing dependencies with no fallback:** None identified.

**Missing dependencies with fallback:**
- date-fns: if not in `package.json`, use `Intl.RelativeTimeFormat` which is available in Hermes (React Native's JS engine). Confirm Hermes version supports it before using — Hermes has supported `Intl.RelativeTimeFormat` since RN 0.70.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no jest.config, vitest.config, or *.test.* files found in repo |
| Config file | None — Wave 0 must create |
| Quick run command | `npm test --workspace=apps/mobile` (once configured) |
| Full suite command | `npm test` from monorepo root |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REVIEW-01 | Line items parsed and rendered from lineItemsJson | unit | `jest` on line-item-row helper | ❌ Wave 0 |
| REVIEW-02 | Quantity stepper produces correct updated JSON | unit | `jest` on mutation helper | ❌ Wave 0 |
| REVIEW-03 | Remove item produces correct filtered JSON | unit | `jest` on mutation helper | ❌ Wave 0 |
| REVIEW-04 | Add item appends with quantity 1 | unit | `jest` on mutation helper | ❌ Wave 0 |
| REVIEW-05 | Auto-save: database.write() called on every edit | unit (mock DB) | `jest` spy test | ❌ Wave 0 |
| REVIEW-06 | canSend: false when 0 items or invalid phone | unit | `jest` pure function test | ❌ Wave 0 |
| HIST-01 | All 7 statuses are valid string literals | unit | `jest` type/schema test | ❌ Wave 0 |
| HIST-02 | History list observe() sorts by created_at desc | integration (DB) | manual — requires WatermelonDB test DB | manual only |
| HIST-03 | Read-only detail fetches from API for non-draft quotes | integration (API) | manual — requires backend | manual only |
| HIST-04 | History list renders with no network | manual | Airplane mode device test | manual only |

### Sampling Rate
- **Per task commit:** Run TypeScript compiler (`npm run build` or `npx tsc --noEmit`) — catches type errors without a test runner
- **Per wave merge:** Full manual smoke test on emulator
- **Phase gate:** All unit tests green (once configured) + manual UAT on device before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] No test framework configured — decide jest vs vitest for the mobile workspace before Wave 1
- [ ] Pure mutation helper functions (parse → mutate → serialize → recalculate total) should be extracted to `src/utils/line-items.ts` and unit tested in isolation
- [ ] `canSend` validation logic should be a pure function in `src/utils/quote-validation.ts` and unit tested

*(Primary test value in this phase is unit tests on the stateless mutation helpers — the WatermelonDB integration is already tested by the library itself. Focus testing effort there.)*

---

## Open Questions

1. **Read-only detail screen: separate route or same route with readonly param?**
   - What we know: D-06 says `sent/approved/etc.` opens a read-only detail screen; `draft_local` opens the editable draft screen
   - What's unclear: Whether to use `app/(app)/quote/[id].tsx` (separate file) or `app/(app)/draft/[id].tsx?readonly=true`
   - Recommendation: Separate file (`quote/[id].tsx`) is cleaner — no conditional rendering sprawl, clearer intent, easier Phase 5 to leave the draft screen untouched

2. **Draft sync payload: full line_items_json or diff?**
   - What we know: `enqueue()` takes a `payload` object; backend PUT /quotes/:id exists for quote metadata updates
   - What's unclear: The backend draft sync path — do we update the draft's `line_items_json` by sending the full JSON, or is there a separate draft endpoint?
   - Recommendation: Send the full `line_items_json` in the payload; backend upserts the entire line items set (delete old, insert new) in a transaction. This matches the write-once snapshot model — simplest implementation, no diff logic needed.

3. **Intl.RelativeTimeFormat vs date-fns for relative timestamps**
   - What we know: `Intl.RelativeTimeFormat` is available in Hermes since RN 0.70; `date-fns` may or may not be installed
   - What's unclear: Whether `formatDistanceToNow` from date-fns is already available in the project
   - Recommendation: Check `package.json` in Wave 0. If date-fns is present, use it. If not, implement a small `formatRelativeDate(date: Date): string` utility using `Intl.RelativeTimeFormat` — avoid adding a new package for a single function.

---

## Sources

### Primary (HIGH confidence)
- `apps/mobile/app/(app)/catalog.tsx` — observe() pattern, database.write() + enqueue(), Modal bottom sheet, Swipeable — verified by direct file read
- `apps/mobile/src/db/schema.ts` — quotes/drafts table schema, column names, types — verified by direct file read
- `apps/mobile/src/db/models/quote.ts` and `draft.ts` — WatermelonDB model field decorators — verified by direct file read
- `apps/mobile/src/components/catalog/catalog-row.tsx` — Swipeable gesture exact implementation — verified by direct file read
- `apps/mobile/src/components/catalog/item-form-sheet.tsx` — Modal bottom sheet exact implementation, price handling logic — verified by direct file read
- `apps/mobile/src/sync/sync-queue.ts` — enqueue() interface, pushToServer() placeholder for quote/draft — verified by direct file read
- `apps/mobile/src/theme/tokens.ts` — all color/spacing/typography tokens, MIN_TOUCH_TARGET=44 — verified by direct file read
- `apps/backend/src/routes/catalog.ts` — Express route pattern, authenticateToken, query(), rowToResponse — verified by direct file read
- `apps/backend/src/db/migrations/001_foundation.sql` and `002_catalog_items.sql` — migration format, trigger pattern — verified by direct file read
- `.planning/phases/04-quote-review-and-history/04-CONTEXT.md` — all locked decisions D-01 through D-21 — verified by direct file read

### Secondary (MEDIUM confidence)
- WatermelonDB documentation (training knowledge, HIGH confidence for established APIs like observe(), database.write(), Q.where, Q.sortBy) — confirmed consistent with actual code in repo

### Tertiary (LOW confidence)
- Hermes `Intl.RelativeTimeFormat` support since RN 0.70 — from training knowledge, not verified against current Hermes version in this project; flag for Wave 0 check

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified present in the repo; no new installations required
- Architecture: HIGH — all patterns verified from actual source files; no speculation
- Pitfalls: HIGH — most pitfalls derived from reading actual code (sync-queue.ts placeholder throw, total_cents dual-record pattern, Swipeable+FlatList known interaction); one LOW (Hermes Intl support)
- Backend: HIGH — migration format and route pattern verified from source files

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable stack — no fast-moving dependencies)
