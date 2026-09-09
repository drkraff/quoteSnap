import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../src/store/auth-store';
import { resolveSessionRedirect } from '../src/navigation/authenticated-entry';
import { initNetworkMonitor } from '../src/sync/network-monitor';
import { initSyncQueue } from '../src/sync/sync-queue';

export default function RootLayout(): JSX.Element {
  const { isLoading, contractor, accessToken, onboardingComplete, restoreSession } =
    useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // Initialize on mount
  useEffect(() => {
    const unsubscribeNetwork = initNetworkMonitor();
    const unsubscribeSyncQueue = initSyncQueue();
    restoreSession();
    return () => {
      unsubscribeSyncQueue();
      unsubscribeNetwork();
    };
  }, []);

  // Auth-gated navigation with onboarding support
  useEffect(() => {
    if (isLoading) return;

    const isAuthenticated = contractor !== null && accessToken !== null;
    const href = resolveSessionRedirect({
      isAuthenticated,
      onboardingComplete,
      segments,
    });
    if (href !== null) {
      router.replace(href);
    }
  }, [isLoading, contractor, accessToken, onboardingComplete, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Slot />
    </GestureHandlerRootView>
  );
}
