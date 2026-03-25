import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '../src/store/auth-store';
import { initNetworkMonitor } from '../src/sync/network-monitor';
import { initSyncQueue } from '../src/sync/sync-queue';

export default function RootLayout(): JSX.Element {
  const { isLoading, contractor, accessToken, restoreSession } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // Initialize on mount
  useEffect(() => {
    initNetworkMonitor();
    const unsubscribeSyncQueue = initSyncQueue();
    restoreSession();
    return () => {
      unsubscribeSyncQueue();
    };
  }, []);

  // Auth-gated navigation
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const isAuthenticated = contractor !== null && accessToken !== null;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [isLoading, contractor, accessToken, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Slot />;
}
