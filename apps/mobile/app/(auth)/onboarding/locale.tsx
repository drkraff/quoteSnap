import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LocaleStep } from '../../../src/components/onboarding/locale-step';
import {
  DEFAULT_CURRENCY,
  DEFAULT_UNIT_SYSTEM,
  DEFAULT_VAT_PERCENT,
  parseVatPercent,
  type CurrencyCode,
  type UnitSystem,
} from '../../../src/money/currency';
import { useAuthStore } from '../../../src/store/auth-store';
import { colors, spacing } from '../../../src/theme/tokens';

export default function LocaleOnboardingScreen(): JSX.Element {
  const router = useRouter();
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(DEFAULT_UNIT_SYSTEM);
  const [vatText, setVatText] = useState(String(DEFAULT_VAT_PERCENT));
  const vatPercent = parseVatPercent(Number(vatText));

  async function handleContinue(): Promise<void> {
    if (vatPercent == null) return;
    await useAuthStore.getState().updateContractorProfile({
      currencyCode,
      unitSystem,
      vatPercent,
    });
    router.push('/(auth)/onboarding/trade-selection');
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
            void handleContinue();
          }}
          continueDisabled={vatPercent == null}
        />
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
});
