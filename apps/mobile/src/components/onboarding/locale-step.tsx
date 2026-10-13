import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CURRENCY_CODES,
  UNIT_SYSTEMS,
  currencyLabel,
  unitSystemLabel,
  type CurrencyCode,
  type UnitSystem,
} from '../../money/currency';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

export const LOCALE_STEP_TITLE = 'Currency and units';
export const LOCALE_STEP_BODY =
  'Quotes in Israel use shekels, meters, and 18% VAT. You can change this later in Settings.';
export const LOCALE_CONTINUE_LABEL = 'Continue';

interface LocaleStepProps {
  currencyCode: CurrencyCode;
  unitSystem: UnitSystem;
  vatText: string;
  onChangeCurrency: (currency: CurrencyCode) => void;
  onChangeUnitSystem: (system: UnitSystem) => void;
  onChangeVat: (text: string) => void;
  onContinue: () => void;
  continueDisabled?: boolean;
  continueLabel?: string;
}

export function LocaleStep({
  currencyCode,
  unitSystem,
  vatText,
  onChangeCurrency,
  onChangeUnitSystem,
  onChangeVat,
  onContinue,
  continueDisabled = false,
  continueLabel = LOCALE_CONTINUE_LABEL,
}: LocaleStepProps): JSX.Element {
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{LOCALE_STEP_TITLE}</Text>
      <Text style={styles.body}>{LOCALE_STEP_BODY}</Text>

      <Text style={styles.label}>Currency</Text>
      <View style={styles.row}>
        {CURRENCY_CODES.map((code) => {
          const selected = code === currencyCode;
          return (
            <Pressable
              key={code}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChangeCurrency(code)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={currencyLabel(code)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {currencyLabel(code)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Units</Text>
      <View style={styles.row}>
        {UNIT_SYSTEMS.map((system) => {
          const selected = system === unitSystem;
          return (
            <Pressable
              key={system}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChangeUnitSystem(system)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={unitSystemLabel(system)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {unitSystemLabel(system)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>VAT %</Text>
      <TextInput
        style={styles.input}
        value={vatText}
        onChangeText={onChangeVat}
        keyboardType="number-pad"
        accessibilityLabel="VAT percent"
        maxLength={3}
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
