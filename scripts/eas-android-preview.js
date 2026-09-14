#!/usr/bin/env node
/**
 * Start an EAS Android internal/preview APK build from apps/mobile.
 *
 * Does not log in, create an Expo project, or submit to a store.
 * You must already have run `npx eas-cli login` and `npx eas-cli init`
 * (see docs/EAS-ANDROID.md).
 *
 * Usage (repo root, PowerShell):
 *   $env:EXPO_PUBLIC_API_URL="https://your-app.up.railway.app"
 *   npm run eas:android:preview
 *
 * Extra args are forwarded to `eas build` (for example `--skip-env-sync`).
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const PLACEHOLDER_HINT =
  /10\.0\.2\.2|localhost|127\.0\.0\.1|YOUR-RAILWAY|YOUR_EAS|example\.com|example\.app/i;

function fail(message) {
  console.error(message);
  console.error('See docs/EAS-ANDROID.md');
  process.exit(1);
}

function runEas(easArgs, cwd, extraEnv) {
  const result = spawnSync(
    'npx',
    ['--yes', 'eas-cli', ...easArgs],
    {
      cwd,
      stdio: 'inherit',
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
      shell: process.platform === 'win32',
    }
  );
  if (result.error) {
    fail(result.error.message);
  }
  if (result.status !== 0) {
    process.exit(result.status == null ? 1 : result.status);
  }
}

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || '').trim();
if (!apiUrl) {
  fail(
    [
      'Set EXPO_PUBLIC_API_URL to your Railway HTTPS origin, then re-run.',
      'PowerShell:',
      '  $env:EXPO_PUBLIC_API_URL="https://your-app.up.railway.app"',
      '  npm run eas:android:preview',
      'bash:',
      '  EXPO_PUBLIC_API_URL=https://your-app.up.railway.app npm run eas:android:preview',
    ].join('\n')
  );
}

if (!/^https:\/\//i.test(apiUrl)) {
  fail(
    `EXPO_PUBLIC_API_URL must be an https:// Railway origin (not the emulator fallback). Got: ${apiUrl}`
  );
}

if (PLACEHOLDER_HINT.test(apiUrl)) {
  fail(
    `EXPO_PUBLIC_API_URL still looks like a placeholder or loopback. Point it at the public Railway HTTPS URL. Got: ${apiUrl}`
  );
}

const extraArgs = process.argv.slice(2);
const skipEnvSync = extraArgs.includes('--skip-env-sync');
const easBuildArgs = extraArgs.filter((arg) => arg !== '--skip-env-sync');
const mobileDir = path.resolve(__dirname, '..', 'apps', 'mobile');

console.log('EAS Android preview (internal APK)');
console.log(`API URL: ${apiUrl}`);
console.log(`Working directory: ${mobileDir}`);
console.log('This does not log you in. Run `npx eas-cli login` first if needed.');

if (!skipEnvSync) {
  console.log('Syncing EXPO_PUBLIC_API_URL to the EAS preview environment (plaintext, not a git secret)...');
  // eas-cli requires the subcommand first. env:set creates or updates (re-runs are safe).
  runEas(
    [
      'env:set',
      '--name',
      'EXPO_PUBLIC_API_URL',
      '--value',
      apiUrl,
      '--environment',
      'preview',
      '--visibility',
      'plaintext',
      '--non-interactive',
    ],
    mobileDir
  );
} else {
  console.log('Skipping EAS env sync (--skip-env-sync). The preview environment must already have EXPO_PUBLIC_API_URL.');
}

console.log('Starting EAS Android preview build...');
runEas(
  ['build', '--platform', 'android', '--profile', 'preview', ...easBuildArgs],
  mobileDir,
  { EXPO_PUBLIC_API_URL: apiUrl }
);
