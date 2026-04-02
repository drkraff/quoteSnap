import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

interface LineItemRowProps {
  name: string;
  quantity: number;
  unitPriceCents: number;
  onQuantityChange: (delta: number) => void;
  onPricePress: () => void;
  onDelete: () => void;
}

export function LineItemRow({
  name,
  quantity,
  unitPriceCents,
  onQuantityChange,
  onPricePress,
  onDelete,
}: LineItemRowProps): JSX.Element {
  const priceDisplay = `$${(unitPriceCents / 100).toFixed(2)}`;

  function renderRightActions(): JSX.Element {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.deleteAction,
          pressed && styles.deleteActionPressed,
        ]}
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${name}`}
      >
        <Ionicons name="trash-outline" size={24} color="#ffffff" />
      </Pressable>
    );
  }

  const minusDisabled = quantity === 1;

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <View style={styles.row}>
        {/* Left: item name */}
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>

        {/* Center: +/- stepper */}
        <View style={styles.stepper}>
          <Pressable
            style={[styles.stepperButton, minusDisabled && styles.stepperButtonDisabled]}
            onPress={() => onQuantityChange(-1)}
            disabled={minusDisabled}
            accessibilityRole="button"
            accessibilityLabel="Decrease quantity"
            accessibilityState={{ disabled: minusDisabled }}
          >
            <Ionicons
              name="remove-circle-outline"
              size={28}
              color={colors.accent}
              style={minusDisabled ? { opacity: 0.4 } : undefined}
            />
          </Pressable>

          <Text style={styles.quantityText}>{quantity}</Text>

          <Pressable
            style={styles.stepperButton}
            onPress={() => onQuantityChange(1)}
            accessibilityRole="button"
            accessibilityLabel="Increase quantity"
          >
            <Ionicons name="add-circle-outline" size={28} color={colors.accent} />
          </Pressable>
        </View>

        {/* Right: price (tappable) */}
        <Pressable
          style={styles.priceButton}
          onPress={onPricePress}
          accessibilityRole="button"
          accessibilityLabel="Edit price"
        >
          <Text style={styles.priceText}>{priceDisplay}</Text>
        </Pressable>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dominant,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: '#000000',
    marginRight: spacing.sm,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    // opacity applied inline on Ionicons to preserve tap region
  },
  quantityText: {
    minWidth: 20,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: '#000000',
    textAlign: 'center',
  },
  priceButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  priceText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    color: '#000000',
  },
  deleteAction: {
    backgroundColor: colors.destructive,
    width: 80,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionPressed: {
    backgroundColor: colors.destructivePressed,
  },
});
