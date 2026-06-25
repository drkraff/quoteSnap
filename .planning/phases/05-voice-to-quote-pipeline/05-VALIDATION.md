---
phase: 5
slug: voice-to-quote-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest-expo (already configured) |
| **Config file** | `apps/mobile/jest.config.js` |
| **Quick run command** | `cd apps/mobile && npm test -- --testPathPattern=confidence` |
| **Full suite command** | `cd apps/mobile && npm test` |
| **Estimated runtime** | ~15 seconds (quick) / ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/mobile && npm test -- --testPathPattern=confidence`
- **After every plan wave:** Run `cd apps/mobile && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + manual device verification
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-T1 | 01 | 1 | VOICE-04, VOICE-06 | unit | `cd apps/backend && npx tsx src/workers/voice-processor.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-01-T2 | 01 | 1 | VOICE-05, VOICE-06, VOICE-07 | unit | `cd apps/backend && npx tsx src/workers/voice-processor.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-02-T1 | 02 | 1 | VOICE-02, VOICE-03, VOICE-09 | manual (filesystem/network toggle) | Device only | manual-only | ⬜ pending |
| 05-02-T2 | 02 | 1 | VOICE-01, VOICE-02, VOICE-03, VOICE-07, VOICE-09 | manual (native audio) | Device/simulator only | manual-only | ⬜ pending |
| 05-03-T1 | 03 | 2 | VOICE-08, VOICE-09 | unit | `cd apps/mobile && npm test -- --testPathPattern=confidence` | ❌ Wave 0 | ⬜ pending |
| 05-03-T2 | 03 | 2 | VOICE-08, VOICE-09 | unit + manual | `cd apps/mobile && npm test -- --testPathPattern=confidence` | ❌ Wave 0 | ⬜ pending |
| 05-03-T3 | 03 | 2 | VOICE-01–09 | manual (human checkpoint) | Device only | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/mobile/src/utils/confidence.test.ts` — unit tests for `confidenceTier()`: covers VOICE-08 (tier mapping: ≥0.85→clean, ≥0.60→review, <0.60→needs_input) and VOICE-09 (no raw percentage rendering)
- [ ] `apps/backend/src/workers/voice-processor.test.ts` — unit tests for catalog ID validation logic: covers VOICE-06 (rejects non-catalog IDs) and VOICE-05 (accepts only catalog IDs)

*Both test files must be created by the executor as Wave 0 tasks in their respective plans.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Recording starts/stops without crash | VOICE-01 | Requires native audio hardware; not mockable in jest-expo | Tap Voice Quote FAB → mic button starts → stop → confirm modal dismisses |
| Audio file persists in documentDirectory | VOICE-02 | Requires real device filesystem access | After recording, check `FileSystem.documentDirectory + 'audio/'` via Expo debug |
| Offline queue entry created and processed on reconnect | VOICE-03 | Requires network toggle; not reliably simulatable in jest | Record with airplane mode on → confirm ai_processing row appears → toggle wifi on → confirm draft_local state |
| Whisper + GPT-4o returns correct transcript and draft | VOICE-04 | Requires live OpenAI API keys | POST to /voice/upload with real audio → verify pg-boss job completes → confirm line items populated |
| Polling returns correct status at each stage | VOICE-07 | Requires live backend + API keys | curl GET /voice/status/:jobId while job is processing; confirm processing→complete→draftId |
| Red-confidence items auto-scroll into view on draft load | VOICE-08 | Requires native FlatList rendering | Open draft with ≥1 red item not in initial viewport; confirm scroll-to-index fires within 300ms |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
