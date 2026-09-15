import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import type { RateCardEntryResponse } from '../../api/rate-card';
import { UnitBadge } from '../catalog/unit-badge';
import { rateCardRowDisplay } from '../../rate-card/row-display';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

interface RateRowProps {
  entry: RateCardEntryResponse;
  onPress: () => void;
  onDelete: () => void;
}

export function RateRow({ entry, onPress, onDelete }: RateRowProps): JSX.Element {
  const display = rateCardRowDisplay(entry);

  function renderRightActions(): JSX.Element {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.deleteAction,
          pressed && styles.deleteActionPressed,
        ]}
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${entry.displayName}`}
      >
        <Ionicons name="trash-outline" size={24} color="#ffffff" />
      </Pressable>
    );
  }

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={display.accessibilityLabel}
      >
        <View style={styles.leftContent}>
          <Text style={styles.name}>{display.name}</Text>
          <Text style={styles.meta}>
            {display.priceDisplay}
            {' · '}
            {display.useCountLabel}
            {display.sourceLabel ? ` · ${display.sourceLabel}` : ''}
          </Text>
        </View>
        <UnitBadge unit={entry.unit} />
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.dominant,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowPressed: {
    opacity: 0.7,
  },
  leftContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  name: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: '#000000',
  },
  meta: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  deleteAction: {
    backgroundColor: colors.destructive,
    width: 80,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionPressed: {
    backgroundColor: colors.destructivePressed,
  },
});
