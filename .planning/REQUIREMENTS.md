# Requirements: QuoteSnap

**Defined:** 2026-03-25
**Core Value:** A contractor can describe a job on-site and have a customer-approved quote before driving off the street — with zero paperwork at night.

---

## v1 Requirements

### Authentication

- [x] **AUTH-01**: Contractor can create an account with phone number or email
- [x] **AUTH-02**: Contractor can log in and remain logged in across sessions (JWT 15-min + 30-day rolling refresh)
- [x] **AUTH-03**: Contractor can log out; session is fully cleared from device
- [x] **AUTH-04**: App detects a valid existing session on launch and skips onboarding

### Onboarding

- [x] **ONBD-01**: Contractor selects their trade (plumbing, electrical, HVAC) during first-launch onboarding
- [x] **ONBD-02**: Contractor receives a pre-seeded service catalog for their trade on account creation
- [ ] **ONBD-03**: Onboarding completes end-to-end within 90 seconds on a 1-bar LTE connection on a low-end Android device
- [ ] **ONBD-04**: Onboarding is completable with partial offline connectivity (account creation requires signal; catalog seeding falls back to bundled offline template)

### Catalog Management

- [x] **CAT-01**: Contractor can add a new service item to their catalog (name, unit, price in cents)
- [x] **CAT-02**: Contractor can edit an existing catalog item (name, unit, price)
- [x] **CAT-03**: Contractor can archive a catalog item (soft delete — data retained, item hidden from AI mapping)
- [x] **CAT-04**: Catalog changes sync to the server when connectivity is available
- [x] **CAT-05**: Contractor can view all active catalog items grouped by trade category
- [x] **CAT-06**: Catalog is available offline from local SQLite (WatermelonDB)

### Voice-to-Quote (AI Pipeline)

- [ ] **VOICE-01**: Contractor can record a voice description of a job using the in-app mic (expo-av)
- [ ] **VOICE-02**: Audio buffer is moved from cacheDirectory → documentDirectory immediately after recording stops (prevents Android cache eviction)
- [ ] **VOICE-03**: Recorded audio is uploaded to the backend via a local offline queue (works without signal)
- [ ] **VOICE-04**: Backend transcribes audio via Whisper and maps transcript to catalog items via GPT-4o function calling
- [ ] **VOICE-05**: GPT-4o is constrained to return only catalog item IDs and quantities — never free-text prices
- [ ] **VOICE-06**: Backend validates every returned item ID against the contractor's catalog; non-catalog items are rejected and flagged for manual entry, not silently passed through
- [ ] **VOICE-07**: AI draft is returned to client via polling at 1.5s intervals
- [ ] **VOICE-08**: Confidence tiers are applied to each line item: ≥0.85 = clean (no badge), 0.60–0.84 = "Review" (amber), <0.60 = "Needs Input" (red, auto-scrolls to item)
- [ ] **VOICE-09**: No raw confidence percentages are shown to contractors — plain language labels only

### Quote Review and Edit

- [ ] **REVIEW-01**: Contractor can view the AI-generated draft as a list of line items with quantities and prices
- [ ] **REVIEW-02**: Contractor can edit any line item (quantity, price) on the draft screen
- [ ] **REVIEW-03**: Contractor can remove a line item from the draft
- [ ] **REVIEW-04**: Contractor can add a catalog item manually to the draft
- [ ] **REVIEW-05**: Draft auto-saves locally on every edit (no data loss on crash or background kill)
- [ ] **REVIEW-06**: Pre-send validation checks that the draft has at least one line item and a valid customer phone number before allowing Send

### SMS Delivery and Customer Approval

- [ ] **SMS-01**: Contractor can enter a customer phone number and send the quote draft via SMS (Twilio)
- [ ] **SMS-02**: Quote is saved as a write-once snapshot at send time (catalog/price edits after send cannot alter the approval page)
- [ ] **SMS-03**: Customer receives an SMS with a link to a branded, mobile-optimized approval page (no app download required)
- [ ] **SMS-04**: Approval page renders from the write-once snapshot — not from live data
- [ ] **SMS-05**: Approval tokens are 32-byte random values stored as SHA-256 hashes; expiry is enforced server-side by pg-boss cron
- [ ] **SMS-06**: Customer can approve the quote with one tap; approval is recorded with a timestamp
- [ ] **SMS-07**: Customer can decline the quote with one tap
- [ ] **SMS-08**: Contractor receives a push notification (FCM) immediately when a customer approves
- [ ] **SMS-09**: Expired quotes show a neutral "This quote has expired" state — not an error page
- [ ] **SMS-10**: Quote expiry TTL is configurable (default 72 hours; exact value to be decided before Phase 5)

### Quote Storage and History

- [ ] **HIST-01**: All quote states (draft_local, draft_queued, sent, approved, declined, expired, failed_send) are persisted locally in WatermelonDB
- [ ] **HIST-02**: Contractor can view a history list of all quotes sorted by recency
- [ ] **HIST-03**: Contractor can open a past quote to view its full line items and status
- [ ] **HIST-04**: Quote history is accessible offline without a network connection

### Offline Sync

- [x] **SYNC-01**: All quotes, catalog items, and drafts live in local SQLite; the app is fully functional without network
- [x] **SYNC-02**: A background sync queue pushes changes to the server when connectivity is available
- [ ] **SYNC-03**: Sync retry schedule: 5s → 15s → 60s → 5m → 15m → dead-letter after max retries
- [ ] **SYNC-04**: Dead-letter items are surfaced to the contractor with a plain-language error and retry option
- [ ] **SYNC-05**: WatermelonDB uses server-as-truth conflict resolution; draft conflicts (pre-send) surface as a visible "Review before sending" prompt — not silent resolution
- [ ] **SYNC-06**: Quote snapshots (post-send) are unaffected by sync state — approval page integrity is guaranteed

### Failure and Edge Cases

- [ ] **FAIL-01**: All 16 failure scenarios defined in WORKFLOW-failure-edge-cases.md have a defined detection method, UX state, and recovery path
- [ ] **FAIL-02**: Mic permission denied: contractor sees an actionable in-app prompt (not a system crash)
- [ ] **FAIL-03**: Audio upload fails offline: item enters the sync queue; contractor is not shown an error mid-flow
- [ ] **FAIL-04**: Whisper transcription fails: contractor is shown a retry option with the original audio available
- [ ] **FAIL-05**: GPT-4o mapping timeout or failure: contractor is shown a partial draft with flagged items and a manual fallback
- [ ] **FAIL-06**: Twilio SMS delivery failure: quote enters failed_send state; contractor can retry from the history screen
- [ ] **FAIL-07**: App crash during voice recording or draft editing: state is recovered from local SQLite on next launch with a "Resume where you left off" prompt
- [ ] **FAIL-08**: FCM token rotation: `contractors.fcm_token` is updated on each login to prevent stale tokens on Samsung/battery-optimized devices

---

## v2 Requirements

### Photo-to-Quote (V1.1)

- **PHOTO-01**: Contractor can photograph a job site and receive a description from GPT-4o Vision
- **PHOTO-02**: Contractor confirms or edits the AI-generated description before catalog mapping runs
- **PHOTO-03**: PII scrubbing (blur/reject faces and license plates) runs before Vision processing
- **PHOTO-04**: PII retention policy and contractor consent language are defined before V1.1 goes live

### Contractor Branding

- **BRAND-01**: Contractor can upload a logo; logo appears on the customer-facing approval page
- **BRAND-02**: Quote approval page renders contractor name and trade (name+logo template for V1; full custom branding deferred)

### Account Management

- **ACCT-01**: Contractor can delete their account; all personal data is purged within 30 days (GDPR/CCPA)
- **ACCT-02**: Contractor can export their quote history as CSV

### App Migration

- **MIGR-01**: Local SQLite schema migrations run automatically on app update without data loss

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Invoicing and payments | Separate product surface; premature before quoting is validated |
| Scheduling | Out of scope for solo contractor; adds complexity with no MVP signal |
| Team management / multi-user | Solo-only MVP; V2 expansion |
| Desktop web interface | Segment is phone-only on-site; defer until post-MVP analytics justify |
| Supplier pricing integration | Requires supplier API relationships; not needed with contractor-defined catalog |
| Real-time WebSockets for AI polling | Polling at 1.5s is sufficient at MVP scale; WebSockets add infra complexity |
| OAuth / social login | Email/phone sufficient for MVP; not a pain point for this persona |
| In-app notifications feed | Push notification is the delivery mechanism; in-app feed is V2 |
| Quote templates / saved quotes | Catalog already serves this function; separate templates add scope without MVP signal |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| ONBD-01 | Phase 2 | Complete |
| ONBD-02 | Phase 2 | Complete |
| ONBD-03 | Phase 2 | Pending |
| ONBD-04 | Phase 2 | Pending |
| CAT-01 | Phase 3 | Complete |
| CAT-02 | Phase 3 | Complete |
| CAT-03 | Phase 3 | Complete |
| CAT-04 | Phase 3 | Complete |
| CAT-05 | Phase 3 | Complete |
| CAT-06 | Phase 3 | Complete |
| VOICE-01 | Phase 5 | Pending |
| VOICE-02 | Phase 5 | Pending |
| VOICE-03 | Phase 5 | Pending |
| VOICE-04 | Phase 5 | Pending |
| VOICE-05 | Phase 5 | Pending |
| VOICE-06 | Phase 5 | Pending |
| VOICE-07 | Phase 5 | Pending |
| VOICE-08 | Phase 5 | Pending |
| VOICE-09 | Phase 5 | Pending |
| REVIEW-01 | Phase 4 | Pending |
| REVIEW-02 | Phase 4 | Pending |
| REVIEW-03 | Phase 4 | Pending |
| REVIEW-04 | Phase 4 | Pending |
| REVIEW-05 | Phase 4 | Pending |
| REVIEW-06 | Phase 4 | Pending |
| SMS-01 | Phase 6 | Pending |
| SMS-02 | Phase 6 | Pending |
| SMS-03 | Phase 6 | Pending |
| SMS-04 | Phase 6 | Pending |
| SMS-05 | Phase 6 | Pending |
| SMS-06 | Phase 6 | Pending |
| SMS-07 | Phase 6 | Pending |
| SMS-08 | Phase 6 | Pending |
| SMS-09 | Phase 6 | Pending |
| SMS-10 | Phase 6 | Pending |
| HIST-01 | Phase 4 | Pending |
| HIST-02 | Phase 4 | Pending |
| HIST-03 | Phase 4 | Pending |
| HIST-04 | Phase 4 | Pending |
| SYNC-01 | Phase 1 | Complete |
| SYNC-02 | Phase 1 | Complete |
| SYNC-03 | Phase 7 | Pending |
| SYNC-04 | Phase 7 | Pending |
| SYNC-05 | Phase 7 | Pending |
| SYNC-06 | Phase 7 | Pending |
| FAIL-01 | Phase 7 | Pending |
| FAIL-02 | Phase 7 | Pending |
| FAIL-03 | Phase 7 | Pending |
| FAIL-04 | Phase 7 | Pending |
| FAIL-05 | Phase 7 | Pending |
| FAIL-06 | Phase 7 | Pending |
| FAIL-07 | Phase 7 | Pending |
| FAIL-08 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 52 total
- Mapped to phases: 52
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 after roadmap creation — phase assignments confirmed*
