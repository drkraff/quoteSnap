import { useState } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { saveOnboardingProfile } from '../../../src/api/onboarding';
import type { Trade } from '../../../src/api/onboarding';
import {
  canFinishOnboarding,
  dollarsToCents,
  onboardingAfterProfile,
  parseMarkupPercentInput,
} from '../../../src/onboarding/profile';
import { useAuthStore } from '../../../src/store/auth-store';
import { enqueue } from '../../../src/sync/sync-queue';
import { onboardingProfileEnqueueParams } from '../../../src/sync/offline-onboarding-seed';

interface TradeOption {
  id: Trade;
  label: string;
}

const TRADES: TradeOption[] = [
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'hvac', label: 'HVAC' },
];

interface TradeCardProps {
  trade: TradeOption;
  isSelected: boolean;
  onPress: (trade: Trade) => void;
}

function TradeCard({ trade, isSelected, onPress }: TradeCardProps): JSX.Element {
  return (
    <Pressable
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={() => onPress(trade.id)}
      accessibilityRole="button"
      accessibilityLabel={trade.label}
      accessibilityState={{ selected: isSelected }}
    >
      {isSelected && (
        <Text style={styles.checkmark}>{'\u2713'}</Text>
      )}
      <Text style={styles.cardLabel}>{trade.label}</Text>
    </Pressable>
  );
}

export default function TradeSelectionScreen(): JSX.Element {
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [hourlyText, setHourlyText] = useState('');
  const [markupText, setMarkupText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const hourlyRateCents = dollarsToCents(hourlyText);
  const markupParsed = parseMarkupPercentInput(markupText);
  const canContinue = canFinishOnboarding({
    trade: selectedTrade,
    hourlyRateCents,
    markupOk: markupParsed.ok,
  });

  async function persistProfile(trade: Trade, cents: number, markupPercent: number | null): Promise<void> {
    const contractorId = useAuthStore.getState().contractor?.id;
    try {
      const response = await saveOnboardingProfile({
        trade,
        hourlyRateCents: cents,
        markupPercent,
      });
      await useAuthStore.getState().updateContractorProfile({
        trade: response.contractor.trade,
        hourlyRateCents: response.contractor.hourlyRateCents,
        markupPercent: response.contractor.markupPercent,
      });
    } catch {
      if (contractorId) {
        await enqueue(
          onboardingProfileEnqueueParams(contractorId, {
            trade,
            hourlyRateCents: cents,
            markupPercent,
          }),
        );
      }
      await useAuthStore.getState().updateContractorProfile({
        trade,
        hourlyRateCents: cents,
        markupPercent,
      });
    }
  }

  async function handleContinue(
    action: 'skip_catalog' | 'load_catalog' | 'import_quotes',
  ): Promise<void> {
    if (selectedTrade === null || hourlyRateCents === null || !markupParsed.ok) return;
    setError(null);
    setSaving(true);
    try {
      const next = onboardingAfterProfile(action, selectedTrade);
      await persistProfile(selectedTrade, hourlyRateCents, markupParsed.value);
      if (next.kind === 'ready') {
        router.replace({
          pathname: '/(auth)/onboarding/ready',
          params: { trade: next.trade, itemCount: String(next.itemCount) },
        });
        return;
      }
      if (next.kind === 'import') {
        router.push({
          pathname: '/(auth)/onboarding/import-quotes',
          params: { trade: next.trade, itemCount: String(next.itemCount) },
        });
        return;
      }
      router.push({
        pathname: '/(auth)/onboarding/seeding',
        params: { trade: next.trade },
      });
    } catch {
      setError('Could not save your rate. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Choose your trade</Text>
        <Text style={styles.subheading}>
          Hourly rate is required. Starter catalog is optional — you can quote with none.
        </Text>
        <FlatList
          data={TRADES}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <TradeCard
              trade={item}
              isSelected={selectedTrade === item.id}
              onPress={setSelectedTrade}
            />
          )}
          scrollEnabled={false}
          style={styles.list}
        />

        <Text style={styles.fieldLabel}>Hourly labor rate</Text>
        <TextInput
          style={styles.input}
          placeholder="75"
          value={hourlyText}
          onChangeText={setHourlyText}
          keyboardType="decimal-pad"
          accessibilityLabel="Hourly labor rate in dollars"
        />

        <Text style={styles.fieldLabel}>Material markup % (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="20"
          value={markupText}
          onChangeText={setMarkupText}
          keyboardType="number-pad"
          accessibilityLabel="Material markup percent"
        />

        {error !== null ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.cta, (!canContinue || saving) && styles.ctaDisabled]}
          onPress={() => {
            void handleContinue('skip_catalog');
          }}
          disabled={!canContinue || saving}
          accessibilityRole="button"
          accessibilityLabel="Start quoting"
          accessibilityState={{ disabled: !canContinue || saving }}
        >
          <Text style={styles.ctaText}>
            {saving ? 'Saving...' : 'Start quoting'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondary}
          onPress={() => {
            void handleContinue('import_quotes');
          }}
          disabled={!canContinue || saving}
          accessibilityRole="button"
          accessibilityLabel="Import old quotes"
          accessibilityState={{ disabled: !canContinue || saving }}
        >
          <Text style={styles.secondaryText}>Import old quotes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondary}
          onPress={() => {
            void handleContinue('load_catalog');
          }}
          disabled={!canContinue || saving}
          accessibilityRole="button"
          accessibilityLabel="Load starter catalog"
          accessibilityState={{ disabled: !canContinue || saving }}
        >
          <Text style={styles.secondaryText}>Load starter catalog</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scroll: {
    padding: 24,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    color: '#666',
    marginBottom: 24,
  },
  list: {
    marginBottom: 16,
  },
  row: {
    gap: 8,
  },
  card: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  cardSelected: {
    backgroundColor: '#f5f5f5',
    borderColor: '#0066cc',
    borderWidth: 2,
  },
  checkmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    fontSize: 14,
    color: '#0066cc',
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  error: {
    color: '#cc0000',
    marginBottom: 12,
    fontSize: 14,
  },
  cta: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    padding: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
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
