# Roadmap: QuoteSnap

**Canonical status:** [CONTEXT.md](../CONTEXT.md). Requirement IDs: [REQUIREMENTS.md](REQUIREMENTS.md).

This file is no longer a live GSD dashboard. Checkboxes and “Plans: TBD” below used to contradict the tree (Phase 1 shown Planned after it shipped; Phase 5 Plan 04 unchecked after `05-04-SUMMARY.md` existed). Phase PLAN/SUMMARY files under `phases/` are the historical record of *how* work landed.

## Snapshot

Match CONTEXT.md, not this table, if they ever diverge. Written 2026-09-15 against `master` through **PR #77**. Overnight 2026-09-14/15 (through **#62**) landed the P0 thin vertical (rate card, adhoc voice, skippable seed + hourly, markup compute) plus MVP adjuncts (thin SYNC-06, FAIL-02/03/04/05/07, private notes, price_source, option groups, client sentence, rooms, photos, PDF share, paste→rate card, My rates list, mark-sent on share). Day session **#63–#77**: Import from photo stub, My rates `q` filter, FAIL-01 map, P0 attach tests, share cancel/empty edges, PDF Assumptions, cost×markup keypad, option-group selection, docs sync (#71, #73), rooms empty/delete/ungroup (#72), Metro UAT checklist (#74; UAT not signed off), dead-letter retry UX (#75), My rates unit/empty-delete (#76), paste-import empty/OCR-stub copy (#77). FAIL-01 is the [16-scenario map](../docs/WORKFLOW-failure-edge-cases.md). Phase 6 SMS/Twilio/approval page, FAIL-06/08, GPT-4o Vision (`PHOTO-01`), Hebrew product copy, a live EAS/Railway demo, and OCR image import are **not** done. Draft **Import from photo** is a blank-price stub (#63). Physical Android UAT is still open.

| Phase | Requirements | In code | Notes |
|-------|--------------|---------|-------|
| 1 Foundation | AUTH-01…04, SYNC-01…02 | Yes | GitHub PRs #1, #2 merged |
| 2 Onboarding | ONBD-01…04 | Yes | Catalog seed skippable; optional paste import into rate card. ONBD-03/04 not device-validated. OCR image import is a stub. |
| 3 Catalog | CAT-01…06 | Yes | Catalog-adjacent **My rates** list is shipped (not a CAT-* ID) |
| 4 Quote review + history | REVIEW-01…06, HIST-01…05 | Yes | HIST-05 archive/unarchive; Share quote builds a customer PDF (not SMS) |
| 5 Voice-to-quote | VOICE-01…09 | Yes | Code-complete (adhoc lines + price attach); physical Android UAT still open |
| 6 SMS + approval | SMS-01…10 | No | SMS/Twilio/`SMS-01`…`10` and hosted approval page not started. Thin customer PDF + OS share + mark-sent (phone optional) is shipped — that is not Phase 6. |
| 7 Sync hardening | SYNC-03…06, FAIL-01…08 | Partial | SYNC-03…06 done (thin SYNC-06: status guards, no `quote_snapshots` table). **FAIL-01** map + **FAIL-02/03/04/05/07** done. Remaining **FAIL-06/08** (SMS, FCM) not done. |
| Backlog 999.1 Railway + EAS | — | Partial | Root `build`/`start` + Railway migrate-on-boot; Android EAS preview in `apps/mobile/eas.json` (`docs/EAS-ANDROID.md`); no `railway.toml` |

Do not start Phase 6, Phase 7 product work, or Railway/EAS from this roadmap alone.
