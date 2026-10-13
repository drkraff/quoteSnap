import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LocaleStep } from '../../../src/components/onboarding/locale-step';
import {
  COUNTRY_PRESETS,
  parseCountryCode,
  parseVatPercent,
  type CountryCode,
} from '../../../src/money/currency';
import { useAuthStore } from '../../../src/store/auth-store';
import { colors, spacing } from '../../../src/theme/tokens';

function initialCountry(): CountryCode {
  return parseCountryCode(useAuthStore.getState().contractor?.countryCode) ?? 'US';
}

export default function LocaleOnboardingScreen(): JSX.Element {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState<CountryCode>(initialCountry);
  const [vatText, setVatText] = useState(() => {
    const stored = useAuthStore.getState().contractor;
    const country = initialCountry();
    if (parseCountryCode(stored?.countryCode) === country && typeof stored?.vatPercent === 'number') {
      return String(stored.vatPercent);
    }
    return String(COUNTRY_PRESETS[country].vatPercent);
  });
  const vatPercent = parseVatPercent(Number(vatText));

  function selectCountry(next: CountryCode): void {
    setCountryCode(next);
    setVatText(String(COUNTRY_PRESETS[next].vatPercent));
  }

  async function handleContinue(): Promise<void> {
    if (vatPercent == null) return;
    const preset = COUNTRY_PRESETS[countryCode];
    await useAuthStore.getState().updateContractorProfile({
      countryCode,
      currencyCode: preset.currencyCode,
      unitSystem: preset.unitSystem,
      vatPercent,
    });
    router.push('/(auth)/onboarding/trade-selection');
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <LocaleStep
          countryCode={countryCode}
          vatText={vatText}
          onChangeCountry={selectCountry}
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
