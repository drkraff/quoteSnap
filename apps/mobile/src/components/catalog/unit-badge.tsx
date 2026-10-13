import { View, Text, StyleSheet } from 'react-native';
import { UNIT_LABELS, parseCatalogUnit } from '../../catalog/units';
import { colors, typography } from '../../theme/tokens';

interface UnitBadgeProps {
  unit: string;
}

export function UnitBadge({ unit }: UnitBadgeProps): JSX.Element {
  const parsed = parseCatalogUnit(unit);
  const label = parsed ? UNIT_LABELS[parsed] : unit;
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  text: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
});
