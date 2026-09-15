import { SafeAreaView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AUTHENTICATED_ENTRY_HREF } from '../../../src/navigation/authenticated-entry';
import { useAuthStore } from '../../../src/store/auth-store';

export default function ReadyScreen(): JSX.Element {
  const { trade, itemCount } = useLocalSearchParams<{ trade: string; itemCount: string }>();
  const router = useRouter();
  const { setOnboardingComplete } = useAuthStore();

  const tradeName = trade ? trade.charAt(0).toUpperCase() + trade.slice(1) : '';
  const parsedCount = Number(itemCount);
  const catalogCount = Number.isFinite(parsedCount) ? parsedCount : 0;
  const skippedCatalog = catalogCount === 0;

  async function handleStartQuoting(): Promise<void> {
    const contractor = useAuthStore.getState().contractor;
    await setOnboardingComplete({
      trade: trade ?? contractor?.trade ?? '',
      hourlyRateCents: contractor?.hourlyRateCents ?? null,
      markupPercent: contractor?.markupPercent ?? null,
    });
    router.replace(AUTHENTICATED_ENTRY_HREF);
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>You're ready to quote</Text>
      <Text style={styles.body}>
        {skippedCatalog
          ? `No starter catalog. Labor uses your ${tradeName || 'trade'} hourly rate when hours are spoken. Unknown prices stay blank.`
          : `Your ${tradeName} catalog has ${itemCount} items. Start quoting or customize it in My Catalog.`}
      </Text>
      <TouchableOpacity
        style={styles.cta}
        onPress={handleStartQuoting}
        accessibilityRole="button"
        accessibilityLabel="Start Quoting"
      >
        <Text style={styles.ctaText}>Start Quoting</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondary}
        onPress={() => {
          router.push({
            pathname: '/(auth)/onboarding/import-quotes',
            params: { trade: trade ?? '', itemCount: itemCount ?? '0' },
          });
        }}
        accessibilityRole="button"
        accessibilityLabel="Import old quotes"
      >
        <Text style={styles.secondaryText}>Import old quotes</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
  },
  cta: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    padding: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    alignSelf: 'stretch',
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondary: {
    padding: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#0066cc',
    fontSize: 16,
    fontWeight: '600',
  },
});
