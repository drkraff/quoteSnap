// Earliest JavaScript this app owns. startup_trace milliseconds are counted
// from this assignment. The native splash stays up until the first screen lays out.
globalThis.__QUOTESNAP_JS_EVAL_START_MS__ = Date.now();
try {
  // expo-router/entry renders immediately. Hide is owned by app/_layout.tsx.
  require('expo-splash-screen').preventAutoHideAsync();
} catch {
  // Non-native hosts (unit tests) have no splash module to hold.
}
require('expo-router/entry');
