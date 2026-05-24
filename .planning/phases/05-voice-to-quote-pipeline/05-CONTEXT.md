# Phase 5: Voice-to-Quote Pipeline - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Contractor taps a dedicated mic FAB on the Quotes tab, records a voice description of a job, and receives a catalog-constrained draft in the existing Phase 4 draft review screen — in under 10 seconds when online. Recording works without signal; audio is queued and processes when connectivity returns. No changes to the draft review screen are needed (Phase 4 D-02 locked this).

</domain>

<decisions>
## Implementation Decisions

### Recording entry point
- **D-01:** Two persistent FABs on the Quotes tab — always visible, no expanded/hidden state:
  - **Bottom FAB (primary):** mic icon + "Voice Quote" label — solid brand color (#0066cc). Bottom position = closest to thumb = primary action.
  - **Above FAB (secondary):** pen icon + "Manual" label — muted/outlined style. Existing manual draft flow unchanged.
  - No long-press, no expanded FAB, no speed-dial. Non-tech-savvy contractors need immediately discoverable actions.
  - `paddingBottom` added to FlatList `contentContainerStyle` (Quotes history list) so last row isn't obscured by the FAB stack.
  - FAB container: `position: 'absolute'`, `bottom` accounts for tab bar height + safe area inset (use `useSafeAreaInsets()` + tab bar height).

### Recording UI flow
- **D-02:** Tapping "Voice Quote" FAB opens a dedicated recording modal/screen (not the draft review screen).
  - Recording screen shows: large mic button to start/stop, waveform or simple animated indicator while recording, duration counter.
  - After contractor taps Stop: modal dismisses, contractor returns to Quotes tab — a new draft row appears in the history list immediately with a progress indicator (processing state).
  - Contractor can freely navigate anywhere in the app while AI processes.

### "AI is processing" UX
- **D-03:** A new draft row appears in the Quotes history list immediately after recording stops — even when offline.
  - New quote status needed: `ai_processing` (added to WatermelonDB schema + backend). Sits between recording and `draft_local` (completed draft).
  - The row displays a progress bar or spinner instead of a total price while in `ai_processing` state.
  - When AI finishes and draft is ready: row updates to `draft_local` status with total price visible.
  - **Completion feedback:** a non-intrusive in-app toast appears — "Your quote is ready — tap to review" — tappable to navigate directly to the draft review screen. Reuse the existing `UndoToast` component pattern (same timing ~3s, same bottom placement). No push notification (contractor is in-app).

### Offline recording flow
- **D-04:** Audio saved to `documentDirectory` immediately after recording stops (VOICE-02 — prevents Android cache eviction). This happens before any network check.
  - Sync queue entry (`entityType: 'audio'`) created immediately — even offline.
  - The `ai_processing` draft row appears in history right away so the contractor knows the recording was captured.
  - When connectivity returns, the sync queue uploads audio → backend triggers Whisper → GPT-4o → draft updates to `draft_local`.
  - While offline/queued: the row shows "Queued" label or a static indicator (not a spinning progress bar — that implies active processing which isn't happening offline).

### Confidence badge placement (LineItemRow)
- **D-05:** Two-part implementation on `LineItemRow`:
  - **Primary signal:** Text badge below the item name, inside the name column (`flex: 1`). "Review" in amber (#d97706), "Needs Input" in red (#dc2626). Explicit text labels survive colorblindness and bright sunlight.
  - **Secondary signal:** Colored left border stripe on the row (3-4pt width) matching the tier color — enables fast visual scanning before reading text.
  - `numberOfLines={1}` stays on the name `Text` element. Badge is a sibling `Text` below it — same parent `View` with `flexDirection: 'column'`.
  - Clean items (≥0.85) render exactly as today — no badge, no border, no row height change.
  - Flagged rows grow slightly taller (~72pt vs 56pt) — acceptable, creates natural visual separation between problem and clean items.
  - Red items auto-scroll into view on draft load (VOICE-08 — already locked in requirements).

### Backend pipeline
- **D-06:** Backend handles voice processing as a job queue (pg-boss, already in stack):
  1. Mobile uploads audio file → `POST /voice/upload` → stores in Cloudflare R2, creates pg-boss job, returns `jobId`
  2. pg-boss worker: transcribes via Whisper API → maps via GPT-4o function calling (catalog-constrained, returns only catalog item IDs + quantities) → validates every returned ID against contractor's catalog → writes draft line items → updates quote status to `draft_local` → deletes audio from R2 (PII)
  3. Mobile polls `GET /voice/status/:jobId` at 1.5s intervals → receives `{ status: 'processing' | 'complete' | 'failed', draftId? }` → on `complete`, navigates or shows toast.
- **D-07:** GPT-4o function calling constraint: system prompt returns only catalog item IDs and quantities. Backend validates every ID; non-catalog items are rejected and flagged for manual entry (VOICE-05, VOICE-06 — locked in requirements).
- **D-08:** Audio deleted from R2 immediately after Whisper transcription completes (PII decision — locked in PROJECT.md).

### New quote status
- **D-09:** `ai_processing` added as a valid quote status in WatermelonDB schema (column comment updated) and backend Postgres CHECK constraint. Full status lifecycle: `ai_processing` → `draft_local` → `draft_queued` → `sent` → `approved | declined | expired | failed_send`.

### Plan split (Claude's Discretion)
- **Plan 1 — Backend voice pipeline:** R2 upload endpoint, pg-boss job queue worker, Whisper integration, GPT-4o function calling + catalog validation, polling endpoint, `ai_processing` status in Postgres.
- **Plan 2 — Mobile recording UI:** Dual FAB, recording modal/screen (expo-av), audio capture + `FileSystem.moveAsync`, sync queue wiring for `audio` entity, `ai_processing` row state in history list, polling loop.
- **Plan 3 — Confidence display + integration:** `LineItemRow` badge + left border, auto-scroll to red items, draft-ready toast, offline queued state display, E2E verification.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — VOICE-01 through VOICE-09 define all acceptance criteria for this phase

### Architecture
- `.planning/PROJECT.md` — Key decisions: catalog-constraint two-layer architecture, polling at 1.5s (not WebSockets), audio deleted from R2 post-transcription, prices as integer cents, offline-first non-negotiable

### Phase 4 context (directly relevant)
- `.planning/phases/04-quote-review-and-history/04-CONTEXT.md` — D-02: Phase 5 voice pipeline slots into existing WatermelonDB quote/draft records; draft review screen needs no changes

### Existing WatermelonDB schema
- `apps/mobile/src/db/schema.ts` — `quotes`, `drafts`, `sync_queue_items` tables; `audio` entity type already declared in sync_queue_items comment
- `apps/mobile/src/db/models/quote.ts` — Quote WatermelonDB model (add `ai_processing` to status handling)
- `apps/mobile/src/db/models/draft.ts` — Draft WatermelonDB model

### Existing sync queue
- `apps/mobile/src/sync/sync-queue.ts` — `entityType: 'audio'` already declared in `SyncEnqueueParams` union; `pushToServer()` needs `audio` case implemented

### Existing patterns to follow
- `apps/mobile/app/(app)/quotes.tsx` — Quotes history list; FAB lives here; add dual FAB, `ai_processing` row rendering
- `apps/mobile/app/(app)/draft/[id].tsx` — Draft review screen; add confidence badge rendering to LineItemRow
- `apps/mobile/src/components/quotes/line-item-row.tsx` — Add confidence badge (badge below name + left border stripe)
- `apps/mobile/src/components/catalog/undo-toast.tsx` — Reuse this pattern for the "quote is ready" toast
- `apps/mobile/app/(app)/_layout.tsx` — Tab navigator (reference for safe area + tab bar height)
- `apps/mobile/src/theme/tokens.ts` — All colors, spacing, typography, MIN_TOUCH_TARGET (44)

### Backend patterns
- `apps/backend/src/routes/quotes.ts` — Express Router + authenticateToken + raw SQL — replicate for voice route
- `apps/backend/src/db/migrations/003_quotes.sql` — Migration format for new status CHECK constraint update

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `UndoToast` — reuse for "Your quote is ready — tap to review" in-app notification (non-intrusive, ~3s)
- `enqueue()` with `entityType: 'audio'` — already typed, needs `pushToServer()` case implemented
- `observe()` WatermelonDB subscription pattern — established in catalog and quotes screens
- `useSafeAreaInsets()` — already in use; needed for FAB bottom positioning
- `LineItemRow` — extend with optional `confidence` prop (`'review' | 'needs_input' | undefined`)

### Established Patterns
- WatermelonDB-first writes → `database.write()` → `enqueue()` — same flow for audio queue entry
- `StyleSheet.create()` inline styles — no shared design system
- Backend: Express Router + `authenticateToken` + raw SQL via `query()`
- pg-boss already in stack for quote expiry cron — extend for voice job queue

### Key Integration Points
- `apps/mobile/app/(app)/quotes.tsx` — add dual FAB stack, `ai_processing` status row rendering
- `apps/mobile/src/sync/sync-queue.ts` — add `audio` case to `pushToServer()`
- New mobile screen: `apps/mobile/app/(app)/voice-record.tsx` (or modal)
- New backend route: `apps/backend/src/routes/voice.ts` mounted in `server.ts`
- New pg-boss worker: `apps/backend/src/workers/voice-processor.ts`
- WatermelonDB schema version bump: add `ai_processing` to status comment (no column change needed — status is a string column)

</code_context>

<specifics>
## Specific Details

- Mic FAB is the PRIMARY action (voice is the core value proposition) → bottom position, brand color (#0066cc), solid fill
- Manual FAB is SECONDARY → sits above mic FAB, muted/outlined style
- Offline recording: show "Queued" label (static) not a spinner — spinner implies active processing
- Confidence badges must not reduce stepper or price tap targets — they live inside the name column's flex space only
- MIN_TOUCH_TARGET=44 on ALL interactive elements, especially FABs (use minHeight: 56 for FABs — comfortable for gloved hands)
- FlatList on Quotes tab needs `contentContainerStyle={{ paddingBottom: fabStackHeight }}` to prevent last row being obscured

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-voice-to-quote-pipeline*
*Context gathered: 2026-04-02*
