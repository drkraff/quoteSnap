import type { ExpoConfig } from 'expo/config';

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
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-av',
      {
        microphonePermission:
          'QuoteSnap needs microphone access to record voice quotes.',
      },
    ],
    // Wires WatermelonDB native Gradle dependency + JSI bridging into android/.
    // Required for SQLiteAdapter({ jsi: true }) to link correctly on SDK 52.
    '@morrowdigital/watermelondb-expo-plugin',
    // Pins the Android Kotlin version the WatermelonDB native build needs.
    ['expo-build-properties', { android: { kotlinVersion: '1.9.24' } }],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // Populated from EXPO_PUBLIC_API_URL in apps/mobile/.env at build time.
    // Falls back to the Android-emulator loopback so existing emulator builds
    // are unaffected when no .env is present.
    apiUrl:
      (process.env['EXPO_PUBLIC_API_URL'] as string | undefined) ??
      'http://10.0.2.2:3000',
  },
};

export default config;
