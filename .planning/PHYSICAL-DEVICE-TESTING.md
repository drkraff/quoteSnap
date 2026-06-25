# Physical Device Testing Guide

Single source of truth for testing QuoteSnap on a real Android device. Use this whenever you need to validate a phase end-to-end before marking it complete, or to sanity-check a change that can't be exercised in unit tests or emulator.

This guide assumes a Windows host (where this repo lives), an Android phone with developer mode on, and both connected to the same Wi-Fi network.

---

## Why physical device, not emulator

Three Phase 5 features only work — or only fail — on real hardware:

1. **Microphone capture** — emulator mic is unreliable, sample rate quirks, no real-world background noise
2. **Audio file lifecycle** (`cacheDirectory` → `documentDirectory` move) — emulator doesn't aggressively evict cache the way real Android does
3. **Network state transitions** — emulator airplane-mode toggle doesn't drive the `NetInfo` listener the way real radio state does

Subsequent phases will need the same setup for SMS receive (Phase 6) and push notifications (Phase 6/7).

---

## Pre-flight checklist

Run through this before plugging anything in. All items must be true.

| # | Item | How to verify |
|---|------|---------------|
| 1 | Phone has USB debugging enabled | Settings → Developer options → USB debugging |
| 2 | Phone and dev laptop on the same Wi-Fi | Check phone Wi-Fi SSID matches laptop's |
| 3 | Phone and laptop trust each other over USB | First connection triggers an RSA fingerprint prompt on the phone — accept |
| 4 | `adb devices` lists the phone as `device` (not `unauthorized` or `offline`) | Run from any terminal: `adb devices` |
| 5 | Docker Desktop is running | `docker ps` returns without error |
| 6 | `quotesnap-db` container is up on port 5433 | `docker ps --filter "name=quotesnap-db"` |
| 7 | Backend `apps/backend/.env` has all required keys | At minimum: `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, R2 keys |
| 8 | Mobile API base URL points to your laptop's LAN IP, not `10.0.2.2` | See **Critical: API base URL** below |

---

## Critical: API base URL must point to your LAN IP

**This is a known blocker.** The mobile app's API client falls back to `http://10.0.2.2:3000`, which is the Android emulator alias for the host machine. A physical phone has no idea what `10.0.2.2` means — every API call will hang or fail with a network error.

### Find your laptop's LAN IP

On Windows PowerShell:
```powershell
ipconfig | Select-String "IPv4"
```

Pick the IPv4 address of your active Wi-Fi adapter (typically `192.168.x.x` or `10.0.x.x`). For example: `192.168.1.42`.

### Set it in app.json

Edit `apps/mobile/app.json` and add an `extra` block inside `expo`:

```json
{
  "expo": {
    "name": "QuoteSnap",
    ...
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "apiUrl": "http://192.168.1.42:3000"
    }
  }
}
```

Replace `192.168.1.42` with your actual IP.

### Verify the backend is reachable from the phone

While the backend is running, open the phone's browser and visit `http://<your-laptop-ip>:3000/health` (or any known endpoint). If you get a response, the URL works. If you get "site can't be reached":

- Windows Firewall is most likely blocking inbound 3000. Add an inbound rule allowing TCP 3000.
- Or temporarily disable the firewall just for the testing session (re-enable after).
- Confirm both devices are on the same SSID, not a guest network with client isolation.

### Don't commit your local apiUrl

Your LAN IP is specific to your home/office. If you push the change, others will get a broken build. Either:

- Add a pre-commit reminder to revert `extra.apiUrl` before staging
- Or move it to a local-only config (Expo's `app.config.js` reading from `.env` is the long-term fix — out of scope for now)

---

## Startup sequence

Run these in order. New terminal per long-running command.

### Terminal 1 — Database

```bash
docker start quotesnap-db
docker ps --filter "name=quotesnap-db"   # confirm Up
```

### Terminal 2 — Backend

```bash
cd apps/backend
npx kill-port 3000              # only if a stale process is holding the port
npm run dev
```

You should see `QuoteSnap backend running on port 3000`. Leave this terminal open — watch the logs while testing.

### Terminal 3 — Mobile (Metro + install)

```bash
cd apps/mobile
adb devices                      # confirm phone listed as "device"
npm run android
```

This builds the dev client, installs it on the phone, and starts Metro. First run takes several minutes (gradle build). Subsequent runs are seconds.

If you only need to reload JS (not native changes), shake the phone or press `r` in the Metro terminal.

### Hard reset between test runs

If a test leaves the app in a confused state and you want a clean slate:

```bash
adb shell pm clear com.quotesnap.app
```

This wipes app data including SQLite, SecureStore tokens, and onboarding state — the next launch behaves like first install.

---

## Test plan

The tests are grouped by what's being validated. Run the **Phase 5 UAT** group at minimum; run **Regression** if it's been a while since the last device test or if you've changed anything touching auth, sync, or navigation.

Mark each result as ✅ pass / ❌ fail / ⚠️ partial. Note anything unexpected in the **observations** column.

### Smoke tests (5 min) — proves the basic loop still works

| # | Steps | Expected | Result |
|---|-------|----------|--------|
| S1 | Launch app on clean install | Lands on login/register screen, no crash | |
| S2 | Register a new account | Lands in onboarding (trade selection) | |
| S3 | Pick a trade, finish seeding | Lands in app on Quotes tab with catalog populated | |
| S4 | Kill app and relaunch | Skips auth + onboarding, opens directly to Quotes tab | |
| S5 | Log out from settings | Returns to auth screen, no session data remains | |

If S1–S5 all pass, the app is healthy enough to test the new stuff.

---

### Phase 5 UAT — Voice-to-Quote Pipeline

These are the three tests from `.planning/phases/05-voice-to-quote-pipeline/05-HUMAN-UAT.md`. They validate VOICE-01 through VOICE-09 end-to-end.

#### Test 5.1 — Full AI pipeline E2E (record → badges)

**Setup**: Logged in, Quotes tab, catalog populated, network on.

**Steps**:
1. Tap the **Voice Quote** FAB (mic icon)
2. Grant microphone permission if prompted
3. Tap the mic button to start recording
4. Describe a multi-item job that should match items in your catalog, e.g.:
   > "Replace two light switches and install three new outlets in the kitchen"
5. Tap stop
6. Confirm the upload prompt — you should be returned to the Quotes tab with a new row showing an `ai_processing` spinner
7. Wait for the row to transition (typically 5–10 seconds — depends on Whisper + GPT-4o latency)
8. When the **DraftReadyToast** appears, tap it
9. You should land on the draft screen

**Expected**:
- Line items appear, each linked to a real catalog item (correct name and price)
- Items with mid-confidence show an amber **Review** badge
- Items with low-confidence show a red **Needs Input** badge
- No raw percentage numbers anywhere in the UI
- If any red item is below the fold, the list auto-scrolls to it within ~300ms
- Total at the bottom matches sum of quantity × catalog price for each item

**Fail signals**:
- ❌ Hangs at `ai_processing` for >30 seconds → check backend logs for Whisper/GPT-4o errors
- ❌ Draft has line items but no badges → confidence column never persisted (verify `quote_line_items.confidence` has non-null values in DB)
- ❌ Draft is empty → catalog ID validation rejected everything (catalog mismatch with prompt vocabulary)
- ❌ App crashes during recording → check `expo-av` permission status in app.json

**Result**:

#### Test 5.2 — Offline queue → connectivity restore

**Setup**: Logged in, network on, on Quotes tab.

**Steps**:
1. Enable airplane mode (swipe down → airplane icon)
2. Tap **Voice Quote** FAB
3. Record a short description, stop, confirm
4. Return to Quotes tab — observe the new row
5. Wait ~10 seconds
6. Disable airplane mode (wait for Wi-Fi to reconnect, ~5s)
7. Watch the row

**Expected**:
- Step 4: row appears with a **cloud / queued** icon (not the spinner)
- Step 5: stays queued — no attempt to process while offline
- Step 6–7: row transitions to `ai_processing` spinner once network returns, then to `draft_local` when complete
- DraftReadyToast appears when processing finishes
- No duplicate rows

**Fail signals**:
- ❌ Row doesn't appear when offline → sync queue not persisting → audio file got dropped
- ❌ Row gets stuck queued after network returns → `NetInfo` listener didn't fire → recent `network-monitor.ts` change is suspect, check `state.isConnected` is being received
- ❌ Multiple rows appear → sync queue ran twice (pending PR 3 fix — log this if seen but don't block)

**Result**:

#### Test 5.3 — Manual Quote FAB regression

**Setup**: Quotes tab, network on.

**Steps**:
1. Tap the **Manual Quote** FAB (text/plus icon — not the mic)
2. Should navigate immediately to a fresh draft screen
3. Add a catalog item via the picker
4. Edit quantity and price on a line item
5. Enter a customer phone number
6. Tap Send

**Expected**:
- All pre-Phase-5 manual quote behavior unchanged
- After Send, returns to Quotes tab (this navigation was added in PR #3)
- New row appears in `draft_queued` state

**Fail signals**:
- ❌ Manual FAB triggers voice recording instead → FAB wiring regression
- ❌ Send doesn't navigate back → recent `draft/[id].tsx` change didn't land
- ❌ Send button stays disabled with valid input → `canSend` regression

**Result**:

---

### Regression — prior-phase features

Run these if it's been more than ~2 weeks since the last device test, or if you're touching auth/sync/navigation.

#### Test R1 — Token refresh under concurrent requests

This validates the PR #2 fix (refresh race coalescing).

**Setup**: Logged in. Optionally shorten access token TTL in backend `.env` to a few minutes to make this exercise practical.

**Steps**:
1. Wait until your access token is expired (or set TTL low)
2. Open a screen that fires multiple API calls on mount (e.g., the Quotes tab pulling history + drafts)
3. Should NOT be silently logged out

**Expected**: All requests succeed; session persists; no return to login screen.

**Fail signal**: Booted to login mid-session → refresh coalescing broke.

#### Test R2 — Catalog CRUD offline

**Steps**:
1. Airplane mode on
2. Add a new catalog item
3. Edit price on an existing item
4. Archive an item
5. Confirm all changes visible immediately
6. Airplane mode off, wait ~30s
7. Check backend DB: changes should be present

#### Test R3 — Quote history offline

**Steps**:
1. With prior quotes in the app, enable airplane mode
2. Open Quotes tab → history list
3. Open a past quote → should show full line items + status
4. No network errors anywhere

---

## When a test fails

1. **Capture evidence immediately** — screenshot the failing screen
2. **Capture logs**:
   ```bash
   adb logcat | grep -E "ReactNativeJS|QuoteSnap" > test-failure-$(date +%Y%m%d-%H%M).log
   ```
   And copy whatever's in the backend terminal at the time.
3. **Save artifacts to `.planning/phases/<current-phase>/uat-failures/`** (create the dir if missing)
4. **Update `<phase>-HUMAN-UAT.md`** marking the failed test, with a one-line cause hypothesis if obvious
5. **Don't try to fix in the same session** — finish the rest of the test plan first to surface multiple issues at once, then triage

---

## After all tests pass

1. Update `.planning/phases/05-voice-to-quote-pipeline/05-HUMAN-UAT.md`:
   - Change `status: partial` → `status: complete`
   - Mark each test result as ✅
   - Update `passed: 3` in the Summary block
2. Return to Claude Code and type `"approved"` to trigger the phase-complete flow (ROADMAP update, STATE advance to Phase 6)
3. Revert any local-only `apiUrl` change you made in `app.json` before opening any new PR

---

## Quick reference — common commands

```bash
# Database
docker start quotesnap-db
docker exec quotesnap-db psql -U postgres -d quotesnap

# Backend
cd apps/backend
npx kill-port 3000
npm run dev

# Mobile
cd apps/mobile
adb devices
npm run android
adb shell pm clear com.quotesnap.app    # nuke app data
adb logcat | grep ReactNativeJS         # live JS logs

# Find LAN IP (Windows)
ipconfig | Select-String "IPv4"
```

---

## Known gotchas

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| All API calls hang/fail | `apiUrl` still pointing at `10.0.2.2` | Add `extra.apiUrl` with LAN IP in `app.json` |
| API calls fail only from phone, fine on emulator | Windows Firewall blocking inbound 3000 | Add inbound rule for TCP 3000 |
| Voice recording silently fails | Microphone permission denied | Settings → Apps → QuoteSnap → Permissions → enable Mic |
| Voice processing never completes | Backend `OPENAI_API_KEY` missing or invalid | Check backend terminal for Whisper/OpenAI errors |
| Draft has items but no badges | `confidence` column null in DB | Run migration: `docker exec quotesnap-db psql -U postgres -d quotesnap -f /...004_voice.sql` |
| Phone says "USB device not recognized" | Wrong cable (charge-only) | Use a data-capable USB cable |
| `adb devices` shows `unauthorized` | First-connect fingerprint not accepted | Unplug, plug back in, accept the prompt on the phone |
| App installs but won't open | Hermes/old-arch mismatch | `adb shell pm clear com.quotesnap.app` and reinstall |
