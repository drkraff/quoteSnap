# Roadmap: QuoteSnap

**Canonical status:** [CONTEXT.md](../CONTEXT.md). Requirement IDs: [REQUIREMENTS.md](REQUIREMENTS.md).

This file is no longer a live GSD dashboard. Checkboxes and “Plans: TBD” below used to contradict the tree (Phase 1 shown Planned after it shipped; Phase 5 Plan 04 unchecked after `05-04-SUMMARY.md` existed). Phase PLAN/SUMMARY files under `phases/` are the historical record of *how* work landed.

## Snapshot

Match CONTEXT.md, not this table, if they ever diverge. Snapshot refreshed 2026-10-05 against `master` through **PR #104**. Phase 6a backend approval is in the API (write-once snapshot, hashed link, HTML approve/decline, dry-run send). **SMS-01**, **SMS-03**, and **SMS-08** are still pending. Local reminders (**#97**), duplicate quote (**#98**), request logs and voice-cost observability (**#99**), and on-device stats (**#100**) are done. **PHOTO-01** Vision is not started. Physical Android UAT is not done. FAIL-06/08, Hebrew product copy, a live EAS/Railway demo, and OCR image import are not done. Draft **Import from photo** is a blank-price stub (#63).

| Phase | Requirements | In code | Notes |
|-------|--------------|---------|-------|
| 1 Foundation | AUTH-01…04, SYNC-01…02 | Yes | GitHub PRs #1, #2 merged |
| 2 Onboarding | ONBD-01…04 | Yes | Catalog seed skippable; optional paste import into rate card. ONBD-03/04 not device-validated. OCR image import is a stub. |
| 3 Catalog | CAT-01…06 | Yes | Catalog-adjacent **My rates** list is shipped (not a CAT-* ID) |
| 4 Quote review + history | REVIEW-01…06, HIST-01…05 | Yes | HIST-05 archive/unarchive; Share quote builds a customer PDF (not SMS) |
| 5 Voice-to-quote | VOICE-01…09 | Yes | Code-complete (adhoc lines + price attach); physical Android UAT still open |
| 6 SMS + approval | SMS-01…10 | Partial | Backend approval is in the API (SMS-02, SMS-04–07, SMS-09, SMS-10). SMS-01, SMS-03, and SMS-08 are pending. Thin customer PDF + OS share is a separate path. |
| 7 Sync hardening | SYNC-03…06, FAIL-01…08 | Partial | SYNC-03…06 done. `quote_snapshots` exists for SMS-02. **FAIL-01** map + **FAIL-02/03/04/05/07** done. Remaining **FAIL-06/08** (SMS, FCM) not done. |
| Backlog 999.1 Railway + EAS | — | Partial | Root `build`/`start` + Railway migrate-on-boot; Android EAS preview in `apps/mobile/eas.json` (`docs/EAS-ANDROID.md`); no `railway.toml` |

Do not start Twilio, FCM, Vision, or a live Railway/EAS demo from this roadmap alone. Phase 6a backend is already in the tree.
