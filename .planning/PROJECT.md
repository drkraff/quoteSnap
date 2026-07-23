# QuoteSnap

## What This Is

QuoteSnap is a mobile-first SaaS for solo trade contractors (plumbers, electricians, HVAC techs) that collapses the gap between job-site visit and quote approval to under 60 seconds. A contractor describes the job by voice; AI maps the description to their own service catalog (no AI-invented prices); a branded quote goes to the customer via SMS; the customer taps to approve; the contractor gets a push notification — all without a laptop.

## Core Value

A contractor can describe a job on-site and have a customer-approved quote before driving off the street — with zero paperwork at night.

## Requirements

### Validated

- [x] Monorepo scaffold (Expo 52 + Express + Postgres) — Validated in Phase 1: Foundation
- [x] JWT auth API (register, login, refresh, logout) with bcrypt-12 and SHA-256 token hashing — Validated in Phase 1: Foundation
- [x] WatermelonDB offline-first schema (quotes, catalog_items, drafts, sync_queue_items) — Validated in Phase 1: Foundation
- [x] Mobile auth flow (Zustand store, SecureStore persistence, auto-refresh, auth-gated navigation) — Validated in Phase 1: Foundation
- [x] Offline-first is non-negotiable — wired on Day 1 as required — Validated in Phase 1: Foundation
- [x] Contractor can review and edit a quote draft (view line items, quantity stepper, price edit, add/remove items, auto-save on every edit) — Validated in Phase 4: Quote Review and History
- [x] Pre-send validation: at least one line item and a valid 10-digit phone required before Send unblocks — Validated in Phase 4: Quote Review and History
- [x] Quote history is accessible offline with all quote states (draft_local, draft_queued, sent, approved, declined, expired, failed_send) — Validated in Phase 4: Quote Review and History
- [x] Read-only quote detail screen with local fallback when offline or quote has no server ID — Validated in Phase 4: Quote Review and History
- [x] Contractor can create an account, select their trade, and receive a pre-seeded service catalog within 90 seconds of first launch — Validated in Phase 2: Onboarding
- [x] Contractor can manage their service catalog (add, edit, archive items; import trade templates) — Validated in Phase 3: Catalog Management

### Active

- [ ] Contractor can record a voice description of a job and receive a draft quote mapped to their catalog in under 10 seconds — code-complete (Phase 5); awaiting on-device Human UAT against live Railway backend
- [ ] AI mapping is catalog-locked: no line item is returned that does not exist in the contractor's catalog
- [ ] Low-confidence AI line items are flagged visually with confidence tiers (≥0.85 clean, 0.60–0.84 amber, <0.60 red)
- [ ] Contractor can send a quote draft via SMS to a customer
- [ ] Customer receives a branded, mobile-optimized approval page via SMS (no app required)
- [ ] Customer can approve or decline the quote with one tap; approval is recorded with a timestamp
- [ ] Contractor receives a push notification (FCM) immediately when a customer approves
- [ ] Quotes are immutable after send: approval page renders from a write-once snapshot
- [ ] Approval tokens use 32-byte random + SHA-256 hash with server-side expiry enforced by pg-boss cron
- [ ] App works fully on-site without cell signal via WatermelonDB offline-first local queue
- [ ] Offline sync queue retries on reconnect with schedule: 5s / 15s / 60s / 5m / 15m / dead-letter
- [ ] All 16 failure scenarios from workflow spec are handled with defined UX states and recovery paths

### Out of Scope

- Photo-to-quote (GPT-4o Vision) — deferred to V1.1; validates voice loop first; adds 2–3 weeks of build risk
- Invoicing and payments — separate product surface; premature before quoting is validated
- Scheduling — out of scope for solo contractor; adds complexity with no MVP signal
- Team management — solo-only in MVP; multi-user is V2 expansion
- Desktop web interface — segment is phone-only on-site; defer until post-MVP analytics justify it
- Supplier pricing integration — requires supplier API relationships; not needed with contractor-defined catalog
- Real-time WebSockets for AI results — polling at 1.5s is sufficient at MVP scale; WebSockets add infra complexity

## Context

- **Target users**: 1.1M self-employed US tradespeople; personas are Mike (plumber, Android), Darnell (electrician, iPhone, tech-comfortable), Sandra (HVAC, iPhone, stalls on install quotes)
- **Competitive gap confirmed**: No competitor has shipped voice-description-to-quote as of March 2026. QuoteIQ (photo+text, no voice) is the nearest threat.
- **Distribution**: Trade Facebook groups (50k+ members), PHCC/ACCA chapter networks, supply house waiting rooms. Design partner commitment is required before Day 1.
- **Pricing**: $79/month or $699/year (14-day free trial, no credit card). 127 paying monthly customers = $10k MRR.
- **Success metrics (beta gate at Day 90)**: median voice-to-send < 90s, AI edit rate < 25% by week 3, Day-30 retention 8/10 contractors, send-to-approval conversion ≥ 50%.
- **Riskiest assumption**: Contractors will trust AI line items enough to send without auditing every number. Gate: if edit rate > 40% at week 1, pause and investigate.
- **Architecture decisions already made**: all prices in integer cents, `quote_snapshots` immutable (DB trigger), `quote_line_items` stores name/price snapshots (never FKs to catalog), audio deleted from R2 after Whisper transcription.

## Constraints

- **Tech Stack**: React Native + Expo managed, WatermelonDB, Zustand, expo-av, EAS Build (mobile); Node.js on Railway, Postgres, pg-boss, Cloudflare R2, Twilio, FCM (backend); Whisper + GPT-4o (AI)
- **Auth**: JWT 15-min access tokens + 30-day rolling refresh tokens stored in Postgres; approval tokens are 32-byte random + SHA-256 (revocable, not JWTs)
- **Offline-first is non-negotiable**: WatermelonDB sync queue must be implemented on Day 1 — retrofitting is a rewrite
- **AI constraint**: GPT-4o returns only catalog item IDs and quantities via function calling; backend validates every returned ID against contractor's catalog before returning draft to client
- **Android-specific**: audio buffer must `FileSystem.moveAsync` from cacheDirectory → documentDirectory immediately after recording (Android cache eviction risk); Samsung Galaxy A32 battery optimizer kills FCM — test on physical device
- **Timeline**: 90-day build to beta with 10 contractors (extended to ~100 days based on WatermelonDB + EAS setup realism)
- **Solo founder**: scope is pre-cut to avoid overrun; photo-to-quote already deferred; build plan is independently shippable at each phase boundary
- **PII**: audio deleted from R2 post-transcription; photo PII handling deferred to V1.1 with explicit policy required before Vision goes live

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React Native + Expo managed workflow | Single TypeScript codebase for iOS/Android; expo-av for audio; EAS Build for distribution without native chains | — Pending |
| WatermelonDB (SQLite) for offline-first | Required for job-site use; retrofitting offline onto online-first is a rewrite; sync queue on Day 1 | — Pending |
| Railway + Managed Postgres over AWS/GCP | Eliminate DevOps overhead for solo founder; ~$70/mo at 100 users | ✅ Live — deployed 2026-07, verified E2E at quotesnap-production-1001.up.railway.app |
| pg-boss for queue + cron | Handles AI job queue and quote expiry cron without Redis at MVP scale | ✅ Live — voice job queue verified on Railway |
| Cloudflare R2 for audio/photo storage | Provides deletion path for PII compliance; audio deleted post-transcription | ✅ Live — audio upload/transcription verified on Railway |
| Catalog-constraint architecture (two layers) | Layer 1: system prompt returns only catalog item IDs; Layer 2: backend validates every ID — prevents trust-ending hallucination bug | — Pending |
| Quote snapshots are write-once (DB trigger) | Editing catalog after send cannot alter what customer sees or approves | — Pending |
| Polling at 1.5s for AI results (not WebSockets) | Sufficient at MVP scale; WebSockets add infra complexity without meaningful UX improvement | — Pending |
| Confidence tiers: ≥0.85 clean, 0.60–0.84 amber, <0.60 red | No raw percentages shown to contractors — plain language labels only | — Pending |
| No free tier; 14-day trial instead | Signals differentiated high-value product; avoids free-tier support cost | — Pending |
| WatermelonDB JSI adapter DISABLED (`jsi: false`) — **reverses** the Phase 1 "JSI enabled" decision | RN 0.76.5 / Expo 52 removed `JSIModulePackage`/`JSIModuleSpec` that WatermelonDB android-jsi imports → build failed | ✅ Applied 2026-07 — async bridge adapter, fully functional; gradle edits fragile (see STATE) |
| Whisper pinned to Hebrew (`WHISPER_LANGUAGE=he`) | Auto-detect mistook Hebrew for Arabic, returning garbage transcripts | ✅ Applied 2026-07 (`6b951aa`) |
| OpenAI `toFile()` instead of global `new File()` | `File` is Node ≥20 only; Railway built on Node 18 → `new File()` threw and killed every voice job | ✅ Applied 2026-07 (`e9b14e9`) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-24 — reconciled with reality after the Railway backend deploy, live
voice-pipeline fixes, and on-device bring-up (April→July work previously tracked only in
HANDOFF.md). Phases 1–4 complete; Phase 5 code-complete and awaiting on-device Human UAT.*
