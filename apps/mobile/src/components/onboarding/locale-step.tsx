import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  COUNTRY_PRESETS,
  ONBOARDING_COUNTRIES,
  countryLabel,
  currencyLabel,
  taxLabelForCountry,
  unitSystemLabel,
  type CountryCode,
} from '../../money/currency';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

export const LOCALE_STEP_TITLE = 'Where do you work?';
export const LOCALE_STEP_BODY =
  'United States uses dollars, feet, and sales tax. Israel uses shekels, meters, and VAT. The tax percent starts at the country default and you can edit it. You can change this later in Settings.';
export const LOCALE_CONTINUE_LABEL = 'Continue';

interface LocaleStepProps {
  countryCode: CountryCode;
  vatText: string;
  onChangeCountry: (country: CountryCode) => void;
  onChangeVat: (text: string) => void;
  onContinue: () => void;
  continueDisabled?: boolean;
  continueLabel?: string;
}

export function LocaleStep({
  countryCode,
  vatText,
  onChangeCountry,
  onChangeVat,
  onContinue,
  continueDisabled = false,
  continueLabel = LOCALE_CONTINUE_LABEL,
}: LocaleStepProps): JSX.Element {
  const preset = COUNTRY_PRESETS[countryCode];
  const taxLabel = taxLabelForCountry(countryCode);

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{LOCALE_STEP_TITLE}</Text>
      <Text style={styles.body}>{LOCALE_STEP_BODY}</Text>

      <Text style={styles.label}>Country</Text>
      <View style={styles.row}>
        {ONBOARDING_COUNTRIES.map((code) => {
          const selected = code === countryCode;
          const label = countryLabel(code);
          return (
            <Pressable
              key={code}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChangeCountry(code)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.summary}>
        {currencyLabel(preset.currencyCode)} · {unitSystemLabel(preset.unitSystem)}
      </Text>
      <Text style={styles.summary}>Cable is priced per ft in the US, and per meter in Israel. Labor is hours.</Text>

      <Text style={styles.label}>{taxLabel} %</Text>
      <TextInput
        style={styles.input}
        value={vatText}
        onChangeText={onChangeVat}
        keyboardType="decimal-pad"
        accessibilityLabel={`${taxLabel} percent`}
        maxLength={7}
      />

      <Pressable
        style={[styles.continue, continueDisabled && styles.continueDisabled]}
        onPress={onContinue}
        disabled={continueDisabled}
        accessibilityRole="button"
        accessibilityLabel={continueLabel}
        accessibilityState={{ disabled: continueDisabled }}
      >
        <Text style={styles.continueText}>{continueLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  heading: {
    color: colors.text,
    fontSize: typography.heading.fontSize,
    fontWeight: typography.heading.fontWeight,
    lineHeight: typography.heading.lineHeight,
  },
  body: {
    color: colors.mutedText,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    marginBottom: spacing.md,
  },
  label: {
    color: colors.mutedText,
    fontSize: typography.label.fontSize,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  summary: {
    color: colors.text,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    marginTop: spacing.sm,
  },
  row: {
    gap: spacing.sm,
  },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  chipText: {
    color: colors.text,
    fontSize: typography.body.fontSize,
  },
  chipTextSelected: {
    fontWeight: '700',
  },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
  },
  continue: {
    marginTop: spacing.lg,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueDisabled: {
    opacity: 0.5,
  },
  continueText: {
    color: colors.text,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
