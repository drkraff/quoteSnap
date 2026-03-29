import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { CatalogItem } from '../../db/models/catalog-item';
import { UnitBadge } from './unit-badge';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

interface CatalogRowProps {
  item: CatalogItem;
  onPress: () => void;
  onArchive: () => void;
}

export function CatalogRow({ item, onPress, onArchive }: CatalogRowProps): JSX.Element {
  const formattedPrice = `$${(item.unitPriceCents / 100).toFixed(2)}`;
  const accessibilityLabel = `${item.name}, ${formattedPrice} per ${item.unit}. Double tap to edit.`;

  function renderRightActions(): JSX.Element {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.archiveAction,
          pressed && styles.archiveActionPressed,
        ]}
        onPress={onArchive}
        accessibilityRole="button"
        accessibilityLabel={`Archive ${item.name}`}
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
        accessibilityLabel={accessibilityLabel}
      >
        <View style={styles.leftContent}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.price}>{formattedPrice}</Text>
        </View>
        <UnitBadge unit={item.unit} />
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
  price: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
  },
  archiveAction: {
    backgroundColor: colors.destructive,
    width: 80,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveActionPressed: {
    backgroundColor: colors.destructivePressed,
  },
});
