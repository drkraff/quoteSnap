import { useEffect, useRef } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { InteractionManager, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../src/store/auth-store';
import { resolveSessionRedirect } from '../src/navigation/authenticated-entry';
import { initNetworkMonitor } from '../src/sync/network-monitor';
import { RootErrorBoundary } from '../src/navigation/root-error-boundary';
import { noteStartup } from '../src/startup/trace';
import { colors } from '../src/theme/tokens';

noteStartup('root_module');

// index.js also calls this before the router loads. A second call is a no-op
// if the native splash is already held.
void SplashScreen.preventAutoHideAsync().catch(() => {
  // No native splash (tests). The root view is still #141414.
});

export default function RootLayout(): JSX.Element {
  const { isLoading, isAuthenticated, contractor, accessToken, onboardingComplete, restoreSession } =
    useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const splashHidden = useRef(false);

  useEffect(() => {
    const unsubscribeNetwork = initNetworkMonitor();
    void restoreSession();
    return () => {
      unsubscribeNetwork();
    };
  }, [restoreSession]);

  // Queue uploads and hydrate compete with the first frame. Start them after
  // the screen has laid out. The quotes list reads WatermelonDB on its own.
  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    let unsubscribeSync = (): void => {};
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      noteStartup('sync_queue_start');
      void import('../src/sync/sync-queue').then((mod) => {
        if (cancelled) return;
        unsubscribeSync = mod.initSyncQueue();
      });
    });
    return () => {
      cancelled = true;
      task.cancel();
      unsubscribeSync();
    };
  }, [isLoading]);

  useEffect(() => {
    if (isLoading) return;

    // A cold refresh can time out before a new access token arrives. The
    // cached contractor is enough to show the on-device quotes; the token
    // refresh keeps retrying in the background.
    const sessionReady = isAuthenticated && contractor !== null;
    const href = resolveSessionRedirect({
      isAuthenticated: sessionReady,
      onboardingComplete,
      segments,
    });
    if (href !== null) {
      router.replace(href);
    }
  }, [isLoading, isAuthenticated, contractor, accessToken, onboardingComplete, segments, router]);

  // useEffect runs after the unlocked tree commits, so the splash covers the
  // dark root until Quotes or login is in the tree. onLayout on the root view
  // can fire once while isLoading is still true and then never again.
  useEffect(() => {
    if (isLoading || splashHidden.current) return;
    splashHidden.current = true;
    noteStartup('first_paint');
    void SplashScreen.hideAsync().catch(() => {
      // Already hidden, or no native splash.
    });
  }, [isLoading]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      {isLoading ? (
        <View style={styles.root} />
      ) : (
        <RootErrorBoundary>
          <Slot />
        </RootErrorBoundary>
      )}
    </GestureHandlerRootView>
  );
}

const styles = {
  root: {
    flex: 1,
    backgroundColor: colors.dominant,
  },
} as const;
