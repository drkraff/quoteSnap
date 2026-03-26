# Roadmap: QuoteSnap

## Overview

QuoteSnap ships in 7 phases that follow the natural delivery boundaries of the product. The foundation (auth + offline core) comes first because the offline-first constraint is non-retrofittable. Onboarding and catalog build the contractor's data layer. Quote review and voice pipeline deliver the core value loop. SMS delivery and customer approval close the loop. Final hardening covers sync resilience and all 16 failure scenarios, producing a beta-ready app.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Auth + offline-first infrastructure; every subsequent phase depends on this
- [ ] **Phase 2: Onboarding** - Trade selection and pre-seeded catalog so contractors enter the app ready to work
- [ ] **Phase 3: Catalog Management** - Contractor owns their service catalog: add, edit, archive, sync
- [ ] **Phase 4: Quote Review and History** - Contractor can review AI drafts, edit line items, and access quote history offline
- [ ] **Phase 5: Voice-to-Quote Pipeline** - Voice recording through Whisper/GPT-4o mapping delivers a catalog-constrained draft in under 10 seconds
- [ ] **Phase 6: SMS Delivery and Customer Approval** - Quote goes to customer via SMS; customer approves; contractor gets push notification
- [ ] **Phase 7: Sync Hardening and Failure Coverage** - Full retry schedule, conflict resolution, and all 16 failure scenarios handled

## Phase Details

### Phase 1: Foundation
**Goal**: Contractors can authenticate and the app is offline-first from day one
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, SYNC-01, SYNC-02
**Success Criteria** (what must be TRUE):
  1. Contractor can create an account with phone number or email and land in the app
  2. Contractor can close and reopen the app and remain logged in without re-authenticating
  3. Contractor can log out; the device holds no session data afterward
  4. App detects an existing valid session on launch and skips the auth screens entirely
  5. All core data (quotes, catalog, drafts) lives in local SQLite and the app opens without network
**Plans**: TBD

### Phase 2: Onboarding
**Goal**: A new contractor completes setup and has a working service catalog within 90 seconds of first launch
**Depends on**: Phase 1
**Requirements**: ONBD-01, ONBD-02, ONBD-03, ONBD-04
**Success Criteria** (what must be TRUE):
  1. Contractor selects their trade during first-launch onboarding and the app seeds an appropriate catalog
  2. Onboarding completes end-to-end in under 90 seconds on a low-end Android on a 1-bar LTE connection
  3. Contractor who loses signal mid-onboarding still receives a usable catalog (bundled offline template)
**Plans**: 2 plans
Plans:
- [x] 02-01-PLAN.md -- Backend API: catalog_items migration, trade templates, POST /onboarding/seed endpoint
- [ ] 02-02-PLAN.md -- Mobile onboarding screens (trade selection, seeding, ready), offline templates, navigation wiring
**UI hint**: yes

### Phase 3: Catalog Management
**Goal**: Contractor can own and maintain their service catalog from the phone
**Depends on**: Phase 2
**Requirements**: CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-06
**Success Criteria** (what must be TRUE):
  1. Contractor can add a new service item (name, unit, price) and it appears in the catalog immediately
  2. Contractor can edit an existing item and the change persists across app restarts
  3. Contractor can archive an item; it disappears from the active list and AI mapping but data is retained
  4. Contractor can view all active catalog items grouped by trade category without a network connection
  5. Catalog changes made offline sync to the server automatically when connectivity returns
**Plans**: TBD
**UI hint**: yes

### Phase 4: Quote Review and History
**Goal**: Contractor can review and edit a quote draft, and access all past quotes offline
**Depends on**: Phase 3
**Requirements**: REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04, REVIEW-05, REVIEW-06, HIST-01, HIST-02, HIST-03, HIST-04
**Success Criteria** (what must be TRUE):
  1. Contractor can view a draft as a list of line items with quantities and prices
  2. Contractor can edit quantity or price on any line item; changes auto-save locally on every edit
  3. Contractor can remove a line item or add a catalog item manually to a draft
  4. Send button is blocked until the draft has at least one line item and a valid customer phone number
  5. Contractor can open the history list and view any past quote with its full line items and status — without network
**Plans**: TBD
**UI hint**: yes

### Phase 5: Voice-to-Quote Pipeline
**Goal**: Contractor describes a job by voice and receives a catalog-constrained draft in under 10 seconds
**Depends on**: Phase 3
**Requirements**: VOICE-01, VOICE-02, VOICE-03, VOICE-04, VOICE-05, VOICE-06, VOICE-07, VOICE-08, VOICE-09
**Success Criteria** (what must be TRUE):
  1. Contractor taps record, describes the job, and receives a draft quote mapped to their catalog in under 10 seconds
  2. Every line item on the draft exists in the contractor's catalog — no AI-invented prices or items appear
  3. Low-confidence line items are labeled "Review" (amber) or "Needs Input" (red) with no raw percentages shown
  4. Red-confidence items auto-scroll into view; contractor is never left wondering why the draft looks incomplete
  5. Voice recording works without network; audio enters the sync queue and processes when signal returns
**Plans**: TBD

### Phase 6: SMS Delivery and Customer Approval
**Goal**: Contractor sends a quote by SMS; customer approves with one tap; contractor gets notified immediately
**Depends on**: Phase 4, Phase 5
**Requirements**: SMS-01, SMS-02, SMS-03, SMS-04, SMS-05, SMS-06, SMS-07, SMS-08, SMS-09, SMS-10
**Success Criteria** (what must be TRUE):
  1. Contractor enters a customer phone number and taps Send; customer receives an SMS with an approval link
  2. Customer opens the link on any mobile browser (no app required) and sees a branded, readable quote
  3. Customer can approve or decline with one tap; approval is recorded with a timestamp
  4. Contractor receives a push notification immediately after customer approves
  5. An expired quote link shows "This quote has expired" — not a broken page or error screen
**Plans**: TBD
**UI hint**: yes

### Phase 7: Sync Hardening and Failure Coverage
**Goal**: The app handles every known failure gracefully — no data loss, no silent failures, no confusing error states
**Depends on**: Phase 6
**Requirements**: SYNC-03, SYNC-04, SYNC-05, SYNC-06, FAIL-01, FAIL-02, FAIL-03, FAIL-04, FAIL-05, FAIL-06, FAIL-07, FAIL-08
**Success Criteria** (what must be TRUE):
  1. A failed sync item retries on the defined schedule (5s / 15s / 60s / 5m / 15m) and surfaces dead-letter items to the contractor with a plain-language error and retry option
  2. A draft conflict (pre-send) surfaces as a visible "Review before sending" prompt — not a silent overwrite
  3. Mic permission denied, audio upload failure, Whisper failure, and GPT-4o timeout each produce a specific, actionable UI state — not a crash or generic error
  4. An app crash during recording or editing recovers the state from local SQLite on next launch with a "Resume where you left off" prompt
  5. All 16 failure scenarios from the workflow spec have a verified detection method, UX state, and recovery path
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/4 | Planned    |  |
| 2. Onboarding | 1/2 | In Progress|  |
| 3. Catalog Management | 0/TBD | Not started | - |
| 4. Quote Review and History | 0/TBD | Not started | - |
| 5. Voice-to-Quote Pipeline | 0/TBD | Not started | - |
| 6. SMS Delivery and Customer Approval | 0/TBD | Not started | - |
| 7. Sync Hardening and Failure Coverage | 0/TBD | Not started | - |
