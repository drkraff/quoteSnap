import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { seedCatalog } from '../../../src/api/onboarding';
import type { Trade } from '../../../src/api/onboarding';
import { useAuthStore } from '../../../src/store/auth-store';
import {
  SEEDING_BLOCKED_BODY,
  SEEDING_BLOCKED_TITLE,
  SEEDING_RETRY_LABEL,
  SEEDING_SKIP_LABEL,
  seedingContractorId,
  seedingReadyHref,
} from '../../../src/onboarding/seeding-run';
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
  const [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function runSeeding(): Promise<void> {
      const contractorId = seedingContractorId(useAuthStore.getState().contractor);
      if (!contractorId) {
        if (!cancelled) setBlocked(true);
        return;
      }

      // 5-second timeout using Promise.race
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000),
      );

      try {
        const response = await Promise.race([seedCatalog(trade), timeoutPromise]);

        // Online seed succeeded — write to WatermelonDB with server ids. Do not enqueue.
        await persistOnlineSeed(contractorId, response.items);

        if (cancelled) return;
        router.replace(seedingReadyHref(trade, response.itemCount));
      } catch {
        // Fetch failed or timed out — bundled template locally, seed when back online.
        try {
          if (!cancelled) {
            setOfflineNotice(true);
            setStatusText('Loading starter catalog...');
          }

          const itemCount = await persistOfflineCatalog(contractorId, trade);
          await enqueue(onboardingSeedEnqueueParams(contractorId, trade));

          // Wait 1 second before advancing
          await new Promise<void>((resolve) => setTimeout(resolve, 1000));

          if (cancelled) return;
          router.replace(seedingReadyHref(trade, itemCount));
        } catch {
          if (!cancelled) setBlocked(true);
        }
      }
    }

    setBlocked(false);
    runSeeding().catch(() => {
      if (!cancelled) setBlocked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, router, trade]);

  if (blocked) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.blockedTitle}>{SEEDING_BLOCKED_TITLE}</Text>
        <Text style={styles.statusText}>{SEEDING_BLOCKED_BODY}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SEEDING_RETRY_LABEL}
          onPress={() => setAttempt((current) => current + 1)}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>{SEEDING_RETRY_LABEL}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SEEDING_SKIP_LABEL}
          onPress={() => router.replace(seedingReadyHref(trade, 0))}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>{SEEDING_SKIP_LABEL}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

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
  blockedTitle: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 24,
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#0066cc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 12,
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#0066cc',
    fontSize: 16,
    fontWeight: '600',
  },
  offlineNotice: {
    color: '#b45309',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
});
