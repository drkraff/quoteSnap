import { colors } from '../../../src/theme/tokens';
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
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { saveOnboardingProfile } from '../../../src/api/onboarding';
import type { Trade } from '../../../src/api/onboarding';
import { persistSetupCatalogItems } from '../../../src/catalog/persist-setup-rates';
import { catalogItemsFromSetupRates } from '../../../src/catalog/setup-rates';
import { UNIT_LABELS, unitsForSystem, type CatalogUnit } from '../../../src/catalog/units';
import { currencySymbol, localeFromUnknown } from '../../../src/money/currency';
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
  const [rates, setRates] = useState<{ key: string; name: string; price: string; unit: CatalogUnit }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const locale = localeFromUnknown(useAuthStore((state) => state.contractor));
  const symbol = currencySymbol(locale.currencyCode);
  const unitChoices = unitsForSystem(locale.unitSystem);

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
        currencyCode: locale.currencyCode,
        unitSystem: locale.unitSystem,
        vatPercent: locale.vatPercent,
      });
      await useAuthStore.getState().updateContractorProfile({
        trade: response.contractor.trade,
        hourlyRateCents: response.contractor.hourlyRateCents,
        markupPercent: response.contractor.markupPercent,
        currencyCode: locale.currencyCode,
        unitSystem: locale.unitSystem,
        vatPercent: locale.vatPercent,
      });
    } catch {
      if (contractorId) {
        await enqueue(
          onboardingProfileEnqueueParams(contractorId, {
            trade,
            hourlyRateCents: cents,
            markupPercent,
            currencyCode: locale.currencyCode,
            unitSystem: locale.unitSystem,
            vatPercent: locale.vatPercent,
          }),
        );
      }
      await useAuthStore.getState().updateContractorProfile({
        trade,
        hourlyRateCents: cents,
        markupPercent,
        currencyCode: locale.currencyCode,
        unitSystem: locale.unitSystem,
        vatPercent: locale.vatPercent,
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
      const contractorId = useAuthStore.getState().contractor?.id ?? '';
      const setupRates = rates.map((row) => ({
        name: row.name,
        unit: row.unit,
        unitPriceCents: dollarsToCents(row.price),
      }));
      const setupCount = await persistSetupCatalogItems({
        contractorId,
        trade: selectedTrade,
        hourlyRateCents,
        rates: setupRates,
      });
      if (next.kind === 'ready') {
        const itemCount = setupCount || catalogItemsFromSetupRates({
          hourlyRateCents,
          rates: setupRates,
        }).length;
        router.replace({
          pathname: '/(auth)/onboarding/ready',
          params: { trade: next.trade, itemCount: String(itemCount) },
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
          accessibilityLabel="Hourly labor rate"
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

        <Text style={styles.fieldLabel}>Your prices</Text>
        <Text style={styles.rateHint}>
          Named prices become catalog items. A blank name or price is skipped.
        </Text>
        {rates.map((row) => (
          <View key={row.key} style={styles.rateCard}>
            <TextInput
              style={styles.input}
              placeholder="Item name"
              placeholderTextColor={colors.mutedText}
              value={row.name}
              onChangeText={(name) => {
                setRates((current) => current.map((item) => (item.key === row.key ? { ...item, name } : item)));
              }}
              accessibilityLabel="Catalog item name"
            />
            <TextInput
              style={styles.input}
              placeholder={`${symbol}0.00`}
              placeholderTextColor={colors.mutedText}
              value={row.price}
              onChangeText={(price) => {
                setRates((current) => current.map((item) => (item.key === row.key ? { ...item, price } : item)));
              }}
              keyboardType="decimal-pad"
              accessibilityLabel="Catalog item price"
            />
            <View style={styles.unitRow}>
              {unitChoices.map((choice) => {
                const selected = row.unit === choice;
                return (
                  <Pressable
                    key={choice}
                    style={[styles.unitChip, selected && styles.unitChipSelected]}
                    onPress={() => {
                      setRates((current) => current.map((item) => (item.key === row.key ? { ...item, unit: choice } : item)));
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={UNIT_LABELS[choice]}
                  >
                    <Text style={styles.unitChipText}>{UNIT_LABELS[choice]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <TouchableOpacity
          style={styles.secondary}
          onPress={() => {
            setRates((current) => [
              ...current,
              { key: `${Date.now()}-${current.length}`, name: '', price: '', unit: 'each' },
            ]);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add a price"
        >
          <Text style={styles.secondaryText}>Add a price</Text>
        </TouchableOpacity>

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
    backgroundColor: colors.dominant,
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
    color: colors.text,
  },
  subheading: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    color: colors.mutedText,
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
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  cardSelected: {
    backgroundColor: colors.secondary,
    borderColor: colors.accent,
    borderWidth: 2,
  },
  checkmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    fontSize: 14,
    color: colors.accent,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    color: colors.text,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: colors.mutedText,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    color: colors.text,
  },
  error: {
    color: colors.errorText,
    marginBottom: 12,
    fontSize: 14,
  },
  cta: {
    backgroundColor: colors.accent,
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
    color: colors.text,
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
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  rateHint: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  rateCard: {
    marginBottom: 8,
  },
  unitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  unitChip: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitChipSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  unitChipText: {
    color: colors.text,
    fontSize: 14,
  },
});
