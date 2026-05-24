QuoteSnap — Phase 5 UAT + Land Phase 5 PR

Project: C:\Users\kraff\Desktop\QuoteSnap — Monorepo (apps/mobile + apps/backend), npm workspaces.
Mobile: Expo 52, RN 0.76.5, WatermelonDB 0.27.1, Hermes, Old Architecture (newArchEnabled=false).
Backend: Express + raw Postgres (via `query()` helper), Docker container quotesnap-db on port 5433.

---

CURRENT STATE: Phase 5 (Voice-to-Quote Pipeline) is code-complete. Branch `feat/p5-04-pipeline-closure` contains 5 commits closing the confidence pipeline + drive-by fixes. PR open against master. Awaiting:

1. Code review / PR merge
2. Physical-device UAT (3 tests, see `.planning/phases/05-voice-to-quote-pipeline/05-HUMAN-UAT.md`)

---

ENVIRONMENT REMINDERS:
- Docker DB: quotesnap-db on port 5433, DATABASE_URL=postgresql://postgres:postgres@localhost:5433/quotesnap
- Local Postgres on 5432 is unrelated — backend uses 5433
- Start container before backend dev: `docker start quotesnap-db`
- Kill stale backend: `npx kill-port 3000` then `cd apps/backend && npm run dev`
- API base URL: must point to dev host reachable from physical phone (NOT 10.0.2.2)

---

PHYSICAL DEVICE UAT (3 tests):

1. Full AI pipeline E2E: record audio → AI processing → draft screen shows confidence badges (amber Review / red Needs Input); first red auto-scrolls; DraftReadyToast appears
2. Offline queue: airplane mode → record → queued row → re-enable network → row transitions to ai_processing → draft_local → toast
3. Manual Quote FAB regression: pre-Phase-5 manual draft creation still works

---

NEXT AFTER PHASE 5 APPROVED:

- Phase 6: SMS Delivery and Customer Approval (10 requirements: SMS-01..SMS-10). Recommended path: `/gsd:discuss-phase`.
- Outstanding from `.planning/phases/01-foundation/prs/PR-PLAN.md`:
  - PR 3 — Sync queue correctness (processing lock, null serverId guard, listener cleanup)
  - PR 4 — Login OR query security fix (mismatched email+phone could return wrong account)

---

RESUME COMMAND: `"approved"` to mark Phase 5 complete and move to Phase 6, or describe any issues found during UAT.
