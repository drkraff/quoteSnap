import { SafeAreaView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../../src/store/auth-store';

export default function ReadyScreen(): JSX.Element {
  const { trade, itemCount } = useLocalSearchParams<{ trade: string; itemCount: string }>();
  const router = useRouter();
  const { setOnboardingComplete } = useAuthStore();

  const tradeName = trade ? trade.charAt(0).toUpperCase() + trade.slice(1) : '';

  async function handleStartQuoting(): Promise<void> {
    await setOnboardingComplete();
    router.replace('/(app)');
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>You're ready to quote</Text>
      <Text style={styles.body}>
        Your {tradeName} catalog has {itemCount} items. Start quoting or customize it in Settings.
      </Text>
      <TouchableOpacity
        style={styles.cta}
        onPress={handleStartQuoting}
        accessibilityRole="button"
        accessibilityLabel="Start Quoting"
      >
        <Text style={styles.ctaText}>Start Quoting</Text>
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
});
