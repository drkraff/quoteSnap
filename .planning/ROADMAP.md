# Roadmap: QuoteSnap

**Canonical status:** [CONTEXT.md](../CONTEXT.md). Requirement IDs: [REQUIREMENTS.md](REQUIREMENTS.md).

This file is no longer a live GSD dashboard. Checkboxes and “Plans: TBD” below used to contradict the tree (Phase 1 shown Planned after it shipped; Phase 5 Plan 04 unchecked after `05-04-SUMMARY.md` existed). Phase PLAN/SUMMARY files under `phases/` are the historical record of *how* work landed.

## Snapshot

Match CONTEXT.md, not this table, if they ever diverge. Written 2026-09-07 against `master` including PR #5 (CI) and PR #7 (voice/auth). Open PRs #8 (sync queue) and #9 (`ai_processing` reaper) are **not** treated as done.

| Phase | Requirements | In code | Notes |
|-------|--------------|---------|-------|
| 1 Foundation | AUTH-01…04, SYNC-01…02 | Yes | GitHub PRs #1, #2 merged |
| 2 Onboarding | ONBD-01…04 | Yes | ONBD-03/04 not device-validated |
| 3 Catalog | CAT-01…06 | Yes | |
| 4 Quote review + history | REVIEW-01…06, HIST-01…04 | Yes | |
| 5 Voice-to-quote | VOICE-01…09 | Yes | Code-complete; physical Android UAT still open |
| 6 SMS + approval | SMS-01…10 | No | Do not implement unless asked |
| 7 Sync hardening | SYNC-03…06, FAIL-01…08 | Partial | Basic queue only |
| Backlog 999.1 Railway + EAS | — | Partial | Root `build`/`start` + `EXPO_PUBLIC_API_URL`; no `eas.json` in repo |

Do not start Phase 6, Phase 7 product work, or Railway/EAS from this roadmap alone.
