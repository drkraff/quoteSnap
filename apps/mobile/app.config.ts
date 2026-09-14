import type { ExpoConfig } from 'expo/config';

const apiUrlFromEnv = process.env['EXPO_PUBLIC_API_URL'] as string | undefined;
const apiUrl = apiUrlFromEnv ?? 'http://10.0.2.2:3000';

// EAS cloud builds re-evaluate this file on the builder. If the preview
// environment is missing EXPO_PUBLIC_API_URL, extra.apiUrl would silently
// become the emulator loopback and a physical APK could not reach the API.
if (process.env['EAS_BUILD'] === 'true') {
  const trimmed = apiUrlFromEnv?.trim();
  if (!trimmed || !trimmed.startsWith('https://')) {
    throw new Error(
      'EAS builds require EXPO_PUBLIC_API_URL to be an https:// origin (Railway). See docs/EAS-ANDROID.md.'
    );
  }
}

const config: ExpoConfig = {
  name: 'QuoteSnap',
  slug: 'quotesnap',
  scheme: 'quotesnap',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  // Explicitly off for the first device build — WatermelonDB 0.27 JSI is more
  // stable on the old architecture. Once confirmed working, flip to true and rebuild.
  newArchEnabled: false,
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.quotesnap.app',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.quotesnap.app',
  },
  // No Expo web target (A-19). Product is mobile-first; the API has no CORS.
  plugins: [
    'expo-router',
    [
      'expo-av',
      {
        microphonePermission:
          'QuoteSnap needs microphone access to record voice quotes.',
      },
    ],
    // Wires WatermelonDB native Gradle into android/. Keep SQLiteAdapter jsi: false
    // (apps/mobile/src/db/index.ts) and newArchEnabled: false — do not flip without
    // a native rebuild and device verification (RN 0.76).
    '@morrowdigital/watermelondb-expo-plugin',
    // Pins the Android Kotlin version the WatermelonDB native build needs.
    ['expo-build-properties', { android: { kotlinVersion: '1.9.24' } }],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      // Replace after `cd apps/mobile && npx eas-cli init` (see docs/EAS-ANDROID.md).
      // The real UUID is not a secret; commit it. Do not invent a live Expo project id.
      projectId:
        (process.env['EAS_PROJECT_ID'] as string | undefined) ??
        '00000000-0000-4000-8000-000000000000',
    },
    // Populated from EXPO_PUBLIC_API_URL in apps/mobile/.env at Metro time, or
    // from the EAS preview environment at cloud build time. Falls back to the
    // Android-emulator loopback so existing emulator builds are unaffected
    // when no .env is present. Physical APKs must use Railway HTTPS — never
    // ship 10.0.2.2 (see docs/EAS-ANDROID.md).
    apiUrl,
  },
};

export default config;
