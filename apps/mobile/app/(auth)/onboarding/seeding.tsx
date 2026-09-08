import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { seedCatalog } from '../../../src/api/onboarding';
import type { Trade } from '../../../src/api/onboarding';
import { useAuthStore } from '../../../src/store/auth-store';
import {
  onboardingSeedEnqueueParams,
  persistOfflineCatalog,
  persistOnlineSeed,
} from '../../../src/sync/offline-onboarding-seed';
import { enqueue } from '../../../src/sync/sync-queue';

export default function SeedingScreen(): JSX.Element {
  const { trade } = useLocalSearchParams<{ trade: Trade }>();
  const router = useRouter();
  const [statusText, setStatusText] = useState('Setting up your catalog...');
  const [offlineNotice, setOfflineNotice] = useState(false);

  useEffect(() => {
    async function runSeeding(): Promise<void> {
      const contractorId = useAuthStore.getState().contractor!.id;

      // 5-second timeout using Promise.race
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000),
      );

      try {
        const response = await Promise.race([seedCatalog(trade), timeoutPromise]);

        // Online seed succeeded — write to WatermelonDB with server ids. Do not enqueue.
        await persistOnlineSeed(contractorId, response.items);

        router.replace({
          pathname: '/(auth)/onboarding/ready',
          params: { trade, itemCount: String(response.itemCount) },
        });
      } catch {
        // Fetch failed or timed out — bundled template locally, seed when back online.
        setOfflineNotice(true);
        setStatusText('Loading starter catalog...');

        const itemCount = await persistOfflineCatalog(contractorId, trade);
        await enqueue(onboardingSeedEnqueueParams(contractorId, trade));

        // Wait 1 second before advancing
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));

        router.replace({
          pathname: '/(auth)/onboarding/ready',
          params: { trade, itemCount: String(itemCount) },
        });
      }
    }

    runSeeding().catch(() => {
      // Errors are handled inside runSeeding; this catch prevents unhandled rejection
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" accessibilityLabel="Loading, please wait" />
      <Text style={styles.statusText}>{statusText}</Text>
      {offlineNotice && (
        <Text style={styles.offlineNotice}>
          No signal -- using starter catalog. You can update this later.
        </Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  statusText: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
  },
  offlineNotice: {
    color: '#b45309',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
});
