---
phase: 4
slug: quote-review-and-history
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None detected — Wave 0 must configure jest for `apps/mobile` workspace |
| **Config file** | None — Wave 0 creates `apps/mobile/jest.config.js` |
| **Quick run command** | `npx tsc --noEmit` (type-check; runs immediately without test setup) |
| **Full suite command** | `npm test --workspace=apps/mobile` (once Wave 0 configures jest) |
| **Estimated runtime** | ~10 seconds (unit tests only; manual tests excluded) |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` — catches type errors without a test runner
- **After every plan wave:** Full manual smoke test on emulator + `npm test --workspace=apps/mobile`
- **Before `/gsd:verify-work`:** All unit tests green + manual UAT on device
- **Max feedback latency:** ~10 seconds (tsc); ~30 seconds (jest once configured)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-W0-01 | Wave0 | 0 | — | setup | `npm test --workspace=apps/mobile` | ❌ W0 | ⬜ pending |
| 4-01-01 | 01 | 1 | REVIEW-01 | unit | `jest src/utils/line-items.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | REVIEW-02 | unit | `jest src/utils/line-items.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | REVIEW-03 | unit | `jest src/utils/line-items.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-04 | 01 | 1 | REVIEW-04 | unit | `jest src/utils/line-items.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-05 | 01 | 1 | REVIEW-05 | unit (mock DB) | `jest src/utils/line-items.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-06 | 01 | 1 | REVIEW-06 | unit | `jest src/utils/quote-validation.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | HIST-01 | unit | `jest src/db/schema.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 2 | HIST-02 | manual | Emulator: open Quotes tab, verify sort order | manual only | ⬜ pending |
| 4-02-03 | 02 | 2 | HIST-03 | manual | Emulator: tap sent quote, verify API detail fetch | manual only | ⬜ pending |
| 4-02-04 | 02 | 2 | HIST-04 | manual | Airplane mode: open Quotes tab, verify list loads | manual only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/mobile/jest.config.js` — configure jest for React Native / Expo with ts-jest
- [ ] `apps/mobile/src/utils/line-items.ts` — extract pure mutation helpers (parse/mutate/serialize/recalculate total)
- [ ] `apps/mobile/src/utils/line-items.test.ts` — stubs for REVIEW-01 through REVIEW-05
- [ ] `apps/mobile/src/utils/quote-validation.ts` — extract `canSend()` pure function
- [ ] `apps/mobile/src/utils/quote-validation.test.ts` — stubs for REVIEW-06
- [ ] `apps/mobile/src/db/schema.test.ts` — stub for HIST-01 status literals

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| History list observe() sorts by created_at desc | HIST-02 | Requires live WatermelonDB observe() stream — no test DB harness | Open Quotes tab with 2+ quotes created at different times; verify newest is first |
| Read-only detail fetches from API for non-draft quotes | HIST-03 | Requires running backend + network | Create a quote via workflow, send it, tap it in history; verify status and line items displayed |
| History list renders with no network | HIST-04 | Requires airplane mode on physical/emulator device | Toggle airplane mode; open app cold; navigate to Quotes tab; verify list is visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
