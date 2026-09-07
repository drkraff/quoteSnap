# Phase 5 UAT — Physical Android

Short runbook for the **three pending human tests** in `.planning/phases/05-voice-to-quote-pipeline/05-HUMAN-UAT.md` (VOICE-01–VOICE-09). Do not invent extra product checks here.

This is not a feature PR. Do not change `newArchEnabled` (`apps/mobile/app.config.ts`, must stay `false`) or WatermelonDB `jsi` (`apps/mobile/src/db/index.ts`, must stay `false`). Money stays integer cents. Offline-first stays required.

**Do not commit screenshots, screen recordings, or other media.** Host proof and paste URLs into the PR body.

Canonical sources:

- Tests: `.planning/phases/05-voice-to-quote-pipeline/05-HUMAN-UAT.md`
- Why human: `.planning/phases/05-voice-to-quote-pipeline/05-VERIFICATION.md` (Human Verification Required)
- Device setup: `.planning/PHYSICAL-DEVICE-TESTING.md` (`EXPO_PUBLIC_API_URL` / `app.config.ts`)
- Status briefing: `CONTEXT.md`

---

## Preconditions

All must be true before Test 1.

| Item | Tree-accurate detail |
|------|----------------------|
| Live backend | `apps/backend` listening on port 3000 (`PORT` in `apps/backend/.env`, default 3000). Confirm with `GET /health` → `{ "status": "ok", ... }`. |
| Physical Android | USB debugging on; `adb devices` shows `device` (not emulator-only). Mic + airplane-mode radio transitions are why this is physical. |
| Same Wi-Fi | Phone and host on the same LAN (not guest isolation). |
| OpenAI key | `OPENAI_API_KEY` set in `apps/backend/.env` (Whisper + GPT-4o). |
| R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` set (see `apps/backend/.env.example`). Audio is uploaded then deleted after transcription. |
| Auth secret | `JWT_ACCESS_SECRET` required (auth throws if unset). Copy the rest from `apps/backend/.env.example`. |
| Local Docker DB | If using the `quotesnap-db` container: host port **5433** (not host Postgres on 5432). `DATABASE_URL` must match, e.g. `postgresql://postgres:postgres@localhost:5433/quotesnap`. Start with `docker start quotesnap-db`. `.env.example` defaults to `5432` — override for Docker. |
| Catalog + session | Logged-in contractor, onboarding done, catalog seeded (needed for GPT mapping). |
| LAN API base URL | Physical devices **cannot** use `10.0.2.2` (emulator-only fallback in `app.config.ts` / `src/api/client.ts` / `src/api/voice.ts`). |

### LAN API URL (physical device)

`apps/mobile/app.config.ts` reads `EXPO_PUBLIC_API_URL` into `extra.apiUrl`. There is no `app.json`.

1. Find the host LAN IPv4 (Wi-Fi adapter), e.g. `192.168.1.42`:
   - Windows: `ipconfig`
   - macOS/Linux: `ipconfig getifaddr en0` or `hostname -I`
2. Create **gitignored** `apps/mobile/.env` (do not commit):

   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.42:3000
   ```

3. Restart Metro / rebuild so Expo reloads config (`cd apps/mobile && npm run android`).
4. On the phone browser: `http://<LAN-IP>:3000/health`. If it fails, allow inbound TCP 3000 on the host firewall.

Whisper language is pinned to Hebrew unless overridden (`WHISPER_LANGUAGE` in backend env; default `he`; set empty to auto-detect). The official UAT prompt is English — for English speech set `WHISPER_LANGUAGE=` (empty) or speak Hebrew that matches catalog names.

---

## Startup (verified scripts)

New terminal per long-running process.

```bash
# 1) Local Docker Postgres (if used)
docker start quotesnap-db
docker ps --filter "name=quotesnap-db"

# 2) Backend (fresh DB: cd apps/backend && npm run migrate)
cd apps/backend
npx kill-port 3000    # only if port 3000 is stale
npm run dev           # or from repo root: npm run backend
# expect: QuoteSnap backend running on port 3000

# 3) Mobile on the phone
cd apps/mobile
adb devices           # must list the phone as "device"
npm run android       # expo run:android
```

Hard reset between runs: `adb shell pm clear com.quotesnap.app` (package from `app.config.ts`; wipes SQLite + SecureStore).

---

## Pending tests (exact 05-HUMAN-UAT set)

Record each as pass / fail / blocked. After stop, the app writes a local `ai_processing` quote and returns to Quotes — there is **no** separate upload-confirm dialog.

### 1. Full AI pipeline E2E (record → badges)

**Setup:** Logged in, Quotes tab, catalog populated, network on.

1. Tap **Voice Quote** FAB (mic).
2. Grant microphone permission if prompted.
3. Tap the mic to record a multi-item job that matches catalog names (planning example: “Replace two light switches and install three new outlets in the kitchen”).
4. Tap stop. Quotes tab should show a new row with an `ai_processing` spinner (**Processing...**).
5. When **DraftReadyToast** appears (“Your quote is ready — tap to review”), tap it.
6. Land on `draft/[id]`.

**Expected:** Line items with catalog name and price; amber **Review** and/or red **Needs Input** badges (no raw %); first red item auto-scrolls into view; toast appeared; footer total is quantity × catalog unit price (cents).

### 2. Offline queue → connectivity restore

**Setup:** Logged in, Quotes tab, network on, then airplane mode.

1. Enable airplane mode.
2. **Voice Quote** → record a short clip → stop.
3. Quotes tab: new row with cloud-upload icon and **Queued** (not the spinner).
4. Wait ~10s — stays queued while offline.
5. Disable airplane mode; wait for Wi-Fi.
6. Row goes to spinner (`ai_processing`) then `draft_local`; DraftReadyToast appears; no duplicate rows.

### 3. Manual Quote FAB regression

**Setup:** Quotes tab.

1. Tap **Manual Quote** FAB (create/pen — not the mic).
2. A new `draft_local` quote is created immediately and the app navigates to `draft/[id]`.
3. No AI processing, no Queued state.

---

## Proof bar

Hosted artifacts only (PR comment, drive, or similar). **Never add media files to git.**

| Test | Before (hosted URL) | After (hosted URL) |
|------|---------------------|--------------------|
| 1. Full AI pipeline | _empty_ | _empty_ |
| 2. Offline queue | _empty_ | _empty_ |
| 3. Manual Quote FAB | _empty_ | _empty_ |

Acceptable proof: before/after screenshots **or** one playable mp4 **from the physical device**, showing real QuoteSnap chrome (FABs, history row, draft badges/toast) — not emulator chrome, not a mock.

---

## After the run

1. Fill results in `.planning/phases/05-voice-to-quote-pipeline/05-HUMAN-UAT.md` (`result:` lines + Summary counts).
2. Paste hosted proof URLs into the PR body slots.
3. Revert local-only `apps/mobile/.env` / `EXPO_PUBLIC_API_URL` — do not commit a LAN IP.
