# QuoteSnap

**Canonical agent briefing:** [CONTEXT.md](../CONTEXT.md). **Requirement IDs:** [REQUIREMENTS.md](REQUIREMENTS.md).

QuoteSnap is a mobile-first app for solo trade contractors. A contractor describes a job by voice; AI maps the description onto **their** service catalog; they review the draft on the phone. Phase 6a backend approval is in the API (write-once snapshot, hashed link, HTML page, dry-run send). Twilio SMS delivery (**SMS-01** / **SMS-03**) and FCM (**SMS-08**) are not built. **PHOTO-01** Vision is not started. Physical Android UAT is not done.

This file used to hold GSD “Key Decisions” with stale Active/Pending columns (catalog still Active after `CAT-01`…`06` shipped; WatermelonDB JSI listed as on; `quote_snapshots` described as if the table existed). Those columns are not a second source of truth.

Locked engineering rules are listed in CONTEXT.md (integer cents, line-item snapshots, catalog-ID-only GPT-4o + server validation, ESM `.js` imports, `newArchEnabled: false` / `jsi: false`, confidence tiers). Out of scope remains: invoicing, scheduling, teams, desktop web, supplier pricing, WebSockets for AI, photo-to-quote until a later version.
