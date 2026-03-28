import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '../src/store/auth-store';
import { initNetworkMonitor } from '../src/sync/network-monitor';
import { initSyncQueue } from '../src/sync/sync-queue';

export default function RootLayout(): JSX.Element {
  const { isLoading, contractor, accessToken, onboardingComplete, restoreSession } =
    useAuthStore();
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

  // Auth-gated navigation with onboarding support
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';
    const isAuthenticated = contractor !== null && accessToken !== null;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && !onboardingComplete && !inAuthGroup) {
      // Authenticated but hasn't completed onboarding
      router.replace('/(auth)/onboarding/trade-selection');
    } else if (isAuthenticated && !onboardingComplete && inAuthGroup) {
      // In auth group during onboarding -- allow navigation within onboarding screens
      // Only redirect to trade-selection if not already in an onboarding screen
      const inOnboarding = (segments as string[])[1] === 'onboarding';
      if (!inOnboarding) {
        router.replace('/(auth)/onboarding/trade-selection');
      }
    } else if (isAuthenticated && onboardingComplete && !inAppGroup) {
      router.replace('/(app)');
    }
  }, [isLoading, contractor, accessToken, onboardingComplete, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Slot />;
}
