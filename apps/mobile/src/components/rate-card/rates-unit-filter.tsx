import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VALID_UNITS, type CatalogUnit } from '../../catalog/units';
import {
  MY_RATES_UNIT_ALL_LABEL,
  MY_RATES_UNIT_FILTER_LABEL,
} from '../../rate-card/list-copy';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

interface RatesUnitFilterProps {
  value: CatalogUnit | '';
  onChange: (unit: CatalogUnit | '') => void;
}

export function RatesUnitFilter({ value, onChange }: RatesUnitFilterProps): JSX.Element {
  const selected = value === '' ? null : value;

  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      <Text style={styles.label}>{MY_RATES_UNIT_FILTER_LABEL}</Text>
      <View style={styles.row}>
        <UnitPill
          label={MY_RATES_UNIT_ALL_LABEL}
          accessibilityLabel="All units"
          checked={selected === null}
          onPress={() => onChange('')}
        />
        {VALID_UNITS.map((unit) => {
          const checked = selected === unit;
          return (
            <UnitPill
              key={unit}
              label={unit}
              accessibilityLabel={unit}
              checked={checked}
              onPress={() => onChange(checked ? '' : unit)}
            />
          );
        })}
      </View>
    </View>
  );
}

function UnitPill({
  label,
  accessibilityLabel,
  checked,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  checked: boolean;
  onPress: () => void;
}): JSX.Element {
  return (
    <Pressable
      style={[styles.pill, checked && styles.pillSelected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.pillText, checked && styles.pillTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  label: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillSelected: {
    backgroundColor: colors.accent,
  },
  pillText: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    color: '#333333',
  },
  pillTextSelected: {
    color: '#ffffff',
  },
});
