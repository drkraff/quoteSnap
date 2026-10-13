import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { LocaleStep } from '../../src/components/onboarding/locale-step';
import { saveOnboardingProfile, type Trade } from '../../src/api/onboarding';
import {
  parseVatPercent,
  type CurrencyCode,
  type UnitSystem,
} from '../../src/money/currency';
import { useContractorLocale } from '../../src/money/use-contractor-locale';
import { useAuthStore } from '../../src/store/auth-store';
import { onboardingProfileEnqueueParams } from '../../src/sync/offline-onboarding-seed';
import { enqueue } from '../../src/sync/sync-queue';
import { colors, spacing, typography } from '../../src/theme/tokens';

const TRADES = new Set<string>(['plumbing', 'electrical', 'hvac']);

export default function SettingsScreen(): JSX.Element {
  const locale = useContractorLocale();
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>(locale.currencyCode);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(locale.unitSystem);
  const [vatText, setVatText] = useState(String(locale.vatPercent));
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const vatPercent = parseVatPercent(Number(vatText));

  async function handleSave(): Promise<void> {
    if (vatPercent == null || saving) return;
    setSaving(true);
    setMessage(null);
    const next = { currencyCode, unitSystem, vatPercent };
    try {
      await useAuthStore.getState().updateContractorProfile(next);
      const contractor = useAuthStore.getState().contractor;
      const trade = contractor?.trade ?? null;
      const hourly = contractor?.hourlyRateCents ?? null;
      if (contractor && trade && TRADES.has(trade) && typeof hourly === 'number' && hourly > 0) {
        const body = {
          trade: trade as Trade,
          hourlyRateCents: hourly,
          markupPercent: contractor.markupPercent ?? null,
          ...next,
        };
        try {
          await saveOnboardingProfile(body);
        } catch {
          await enqueue(onboardingProfileEnqueueParams(contractor.id, body));
        }
      }
      setMessage('Saved');
    } catch {
      setMessage('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <LocaleStep
          currencyCode={currencyCode}
          unitSystem={unitSystem}
          vatText={vatText}
          onChangeCurrency={setCurrencyCode}
          onChangeUnitSystem={setUnitSystem}
          onChangeVat={setVatText}
          onContinue={() => {
            void handleSave();
          }}
          continueDisabled={vatPercent == null || saving}
          continueLabel={saving ? 'Saving…' : 'Save'}
        />
        {message ? <Text style={styles.message}>{message}</Text> : null}
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
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  message: {
    marginTop: spacing.md,
    color: colors.mutedText,
    fontSize: typography.body.fontSize,
    textAlign: 'center',
  },
});
