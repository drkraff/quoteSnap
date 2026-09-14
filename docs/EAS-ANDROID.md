# EAS Android preview builds

Install QuoteSnap on a physical Android phone **without USB debugging or Metro**. The `preview` profile builds a standalone internal APK that already contains JS and talks to your **Railway HTTPS API**.

This is config and docs only. Nobody in CI logs into Expo or submits a store build. There is still **no live demo claim** — you create the Expo project and run the build on your PC.

Related: Railway start command is [DEPLOY-RAILWAY.md](DEPLOY-RAILWAY.md). USB + Metro remains valid for local debugging in [`.planning/PHYSICAL-DEVICE-TESTING.md`](../.planning/PHYSICAL-DEVICE-TESTING.md).

Do **not** flip `newArchEnabled` (must stay `false` in `apps/mobile/app.config.ts`) or WatermelonDB `jsi` (must stay `false` in `apps/mobile/src/db/index.ts`). Do not use this path to add Phase 6 SMS.

---

## What you get

| | USB + Metro (`npm run android`) | EAS preview APK |
|---|---|---|
| Cable / `adb` | Required | Not required |
| Metro bundler | Required | Not used — JS is baked in |
| API URL | LAN `http://<your-ip>:3000` | `https://<your-railway-host>` |
| Sharing | That one plugged-in phone | Expo install link / downloaded `.apk` |

`apps/mobile/eas.json` defines one profile: **`preview`**, `distribution: internal`, Android **`apk`**. It is not a Play Store AAB and not an `expo-dev-client` build.

---

## One-time setup (your PC)

You need an [Expo](https://expo.dev) account and a public Railway API (`GET https://<host>/health` should succeed from a phone browser).

From the **repo root** after `npm ci`:

```powershell
cd apps/mobile
npx eas-cli login
npx eas-cli init
```

`eas init` creates (or links) an Expo project and writes `extra.eas.projectId` into `apps/mobile/app.config.ts`. That UUID is **not a secret** — commit the real ID when Expo gives it to you. Until then the committed placeholder is `00000000-0000-4000-8000-000000000000`; a build against that ID will fail on purpose.

If `eas init` also sets `owner` (your Expo username), commit that too. Do not invent an owner or project id.

The repo does **not** store EAS credentials. First Android build will ask Expo to generate a keystore (EAS-managed). Accept that prompt. Never commit `credentials.json` or `.jks` / `.keystore` files.

---

## Point the APK at Railway (`EXPO_PUBLIC_API_URL`)

`apps/mobile/app.config.ts` copies `EXPO_PUBLIC_API_URL` into `extra.apiUrl` **at EAS build time**. The phone cannot reach `http://10.0.2.2:3000` (emulator-only fallback).

Use the public HTTPS origin of the Railway API service, **no trailing slash**, for example:

```text
https://your-service.up.railway.app
```

That value is a public URL, not a secret. Still do not commit LAN IPs or `.env` files.

The helper script uploads it to the Expo **preview** environment as plaintext (so the cloud builder sees the same URL), then starts the build:

**PowerShell**

```powershell
cd <repo-root>
$env:EXPO_PUBLIC_API_URL="https://your-service.up.railway.app"
npm run eas:android:preview
```

**bash**

```bash
cd <repo-root>
EXPO_PUBLIC_API_URL=https://your-service.up.railway.app npm run eas:android:preview
```

Equivalent manual commands from `apps/mobile` (if you prefer not to use the script):

```powershell
npx eas-cli env:set --name EXPO_PUBLIC_API_URL --value https://your-service.up.railway.app --environment preview --visibility plaintext
npx eas-cli build --platform android --profile preview
```

If the URL is already set on Expo and you do not want to overwrite it:

```powershell
$env:EXPO_PUBLIC_API_URL="https://your-service.up.railway.app"
npm run eas:android:preview -- --skip-env-sync
```

Check what Expo has stored:

```powershell
cd apps/mobile
npx eas-cli env:list --environment preview
```

---

## Install on the phone

1. Wait for the EAS job (Expo dashboard or the CLI link).
2. Open the **internal distribution** URL on the phone, or download the `.apk`.
3. Allow install from that source if Android asks.
4. Confirm the app can reach the API: on the phone, open `https://<your-railway-host>/health` in the browser first if login fails.

No USB. No Metro. A new JS change needs a **new preview build**.

Wipe local data the same as a fresh install: Android Settings → Apps → QuoteSnap → Storage → Clear data (there is no `adb` requirement).

---

## What this does not do

- **`eas login` / `eas init` / `eas submit`** — you run those locally. CI does not.
- **iOS** — not configured. Android APK only.
- **`developmentClient`** — that would still need Metro. The preview profile is a standalone APK.
- **Play Store / `eas submit`** — no production profile and no store credentials in git.
- **`railway.toml`** — still absent. API boot is documented in [DEPLOY-RAILWAY.md](DEPLOY-RAILWAY.md).

---

## Invariants (do not “fix” in a follow-up)

| Flag | File | Value |
|------|------|--------|
| `newArchEnabled` | `apps/mobile/app.config.ts` | `false` |
| WatermelonDB `jsi` | `apps/mobile/src/db/index.ts` | `false` |

EAS prebuild uses that app config (including `@morrowdigital/watermelondb-expo-plugin` with `{ disableJsi: true }` and Kotlin `1.9.24`). Do not add `newArchEnabled` to `eas.json`.

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| CLI: project not found / invalid project id | Placeholder `projectId` still in `app.config.ts` | Run `npx eas-cli init` in `apps/mobile` and commit the UUID Expo prints |
| CLI: not logged in | No Expo session | `npx eas-cli login` |
| App API calls hang or fail | APK still using `10.0.2.2` or a placeholder URL | Rebuild after setting `EXPO_PUBLIC_API_URL` to the Railway HTTPS origin; `eas env:list --environment preview` |
| Health URL works in the phone browser, app does not | Stale APK | Install the new preview build; JS is not live-reloaded |
| First build asks for an Android keystore | Expected | Let EAS generate and store it; do not commit keystore files |
| `env:set` fails | No Expo project yet, or old CLI | `eas init`, then `npx eas-cli --version` (need 14+). Or pass `--skip-env-sync` after setting the var in the Expo dashboard |
| Gradle `:watermelondb-jsi:compileReleaseJavaWithJavac` cannot find `JSIModulePackage` / `JSIModuleSpec` | `@morrowdigital/watermelondb-expo-plugin` still wires Android JSI unless disabled | Plugin entry must be `['@morrowdigital/watermelondb-expo-plugin', { disableJsi: true }]` (camelCase `disableJsi`, not `disableJSI`). Keep `newArchEnabled: false` and JS `jsi: false`. Do not enable JSI. |
