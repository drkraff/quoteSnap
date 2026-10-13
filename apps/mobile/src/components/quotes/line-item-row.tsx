import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { dollarsToCents } from '../../onboarding/profile';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';
import {
  LINE_TOTAL_LABEL,
  UNIT_PRICE_LABEL,
  formatMoneyCents,
  formatQtyTimesUnitPrice,
  formatUnitPriceLabel,
  isUnknownUnitPrice,
  lineTotalCents,
  parseLineQuantityInput,
} from '../../utils/line-items';
import { draftPriceFlag, draftPriceSourceTag } from '../../utils/price-source';

interface LineItemRowProps {
  name: string;
  quantity: number;
  unit?: string | null;
  unitPriceCents: number | null;
  onNameCommit: (name: string) => void;
  onQuantityCommit: (quantity: number) => void;
  onUnitPriceCommit: (cents: number | null) => void;
  onPriceDetails: () => void;
  onDelete: () => void;
  confidence?: 'review' | 'needs_input';
  priceSource?: string | null;
}

type EditField = 'name' | 'qty' | 'price';

export function LineItemRow({
  name,
  quantity,
  unit,
  unitPriceCents,
  onNameCommit,
  onQuantityCommit,
  onUnitPriceCommit,
  onPriceDetails,
  onDelete,
  confidence,
  priceSource,
}: LineItemRowProps): JSX.Element {
  const [editing, setEditing] = useState<EditField | null>(null);
  const [draft, setDraft] = useState('');
  const priceUnknown = isUnknownUnitPrice(unitPriceCents);
  const totalCents = lineTotalCents({ quantity, unitPriceCents });
  const mathLabel = formatQtyTimesUnitPrice(quantity, unitPriceCents, unit);
  const flag = draftPriceFlag(priceSource, unitPriceCents);
  const sourceTag = draftPriceSourceTag(flag);
  const unknownFlag = flag === 'unknown';

  function begin(field: EditField, value: string): void {
    setEditing(field);
    setDraft(value);
  }

  function commit(): void {
    const field = editing;
    const text = draft;
    setEditing(null);
    if (field === 'name') {
      onNameCommit(text);
      return;
    }
    if (field === 'qty') {
      const parsed = parseLineQuantityInput(text);
      if (parsed != null) onQuantityCommit(parsed);
      return;
    }
    if (field === 'price') {
      const trimmed = text.trim();
      if (trimmed === '' || trimmed === '$') {
        onUnitPriceCommit(null);
        return;
      }
      const cents = dollarsToCents(trimmed);
      if (cents != null) onUnitPriceCommit(cents);
    }
  }

  function renderRightActions(): JSX.Element {
    return (
      <Pressable
        style={({ pressed }) => [styles.deleteAction, pressed && styles.deleteActionPressed]}
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${name}`}
      >
        <Ionicons name="trash-outline" size={24} color={colors.text} />
      </Pressable>
    );
  }

  const tierBorderStyle =
    confidence === 'needs_input' || unknownFlag
      ? { borderLeftWidth: 4, borderLeftColor: colors.destructive }
      : confidence === 'review'
        ? { borderLeftWidth: 4, borderLeftColor: colors.warning }
        : {};

  const lineTotalText = priceUnknown ? '—' : formatMoneyCents(totalCents);

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <View
        style={[styles.row, tierBorderStyle]}
        accessibilityLabel={`${name}. ${sourceTag ?? 'price set'}. ${mathLabel}. ${UNIT_PRICE_LABEL} ${formatUnitPriceLabel(unitPriceCents)}. ${LINE_TOTAL_LABEL} ${priceUnknown ? 'not set' : formatMoneyCents(totalCents)}`}
      >
        <View style={styles.nameRow}>
          <View style={styles.nameBlock}>
            {editing === 'name' ? (
              <TextInput
                style={styles.nameInput}
                value={draft}
                onChangeText={setDraft}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={commit}
                onBlur={commit}
                accessibilityLabel={`Line name ${name}`}
              />
            ) : (
              <Pressable
                style={styles.nameHit}
                onPress={() => begin('name', name)}
                accessibilityRole="button"
                accessibilityLabel={`Edit name ${name}`}
              >
                <Text style={styles.name} numberOfLines={2}>
                  {name}
                </Text>
              </Pressable>
            )}
            {sourceTag ? (
              <View style={styles.sourceTag} accessibilityLabel={sourceTag}>
                <Text style={styles.sourceTagText}>{sourceTag}</Text>
              </View>
            ) : null}
          </View>
          <Pressable
            style={styles.removeButton}
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${name}`}
          >
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>

        <Text style={styles.math}>{mathLabel}</Text>

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.columnLabel}>Qty</Text>
            {editing === 'qty' ? (
              <TextInput
                style={styles.valueInput}
                value={draft}
                onChangeText={setDraft}
                autoFocus
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={commit}
                onBlur={commit}
                accessibilityLabel={`Quantity for ${name}`}
              />
            ) : (
              <Pressable
                style={styles.valueHit}
                onPress={() => begin('qty', String(quantity))}
                accessibilityRole="button"
                accessibilityLabel={`Edit quantity ${quantity}`}
              >
                <Text style={styles.valueText}>{String(quantity)}</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.column}>
            <Pressable onPress={onPriceDetails} accessibilityRole="button" accessibilityLabel="Adjust rate">
              <Text style={styles.columnLabel}>{UNIT_PRICE_LABEL}</Text>
            </Pressable>
            {editing === 'price' ? (
              <TextInput
                style={styles.valueInput}
                value={draft}
                onChangeText={setDraft}
                autoFocus
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={commit}
                onBlur={commit}
                accessibilityLabel={`${UNIT_PRICE_LABEL} for ${name}`}
              />
            ) : (
              <Pressable
                style={styles.valueHit}
                onPress={() =>
                  begin(
                    'price',
                    priceUnknown || unitPriceCents == null ? '' : (unitPriceCents / 100).toFixed(2),
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={
                  priceUnknown
                    ? `Edit ${UNIT_PRICE_LABEL}. Price needed`
                    : `Edit ${UNIT_PRICE_LABEL} ${formatUnitPriceLabel(unitPriceCents)}`
                }
              >
                <Text style={[styles.valueText, priceUnknown && styles.priceUnknown]}>
                  {priceUnknown ? 'Price needed' : formatUnitPriceLabel(unitPriceCents)}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.columnEnd}>
            <Text style={styles.columnLabel}>{LINE_TOTAL_LABEL}</Text>
            <Text style={[styles.totalText, priceUnknown && styles.priceUnknown]}>{lineTotalText}</Text>
          </View>
        </View>

        {confidence === 'review' ? <Text style={styles.badgeAmber}>Review</Text> : null}
        {confidence === 'needs_input' ? <Text style={styles.badgeRed}>Needs Input</Text> : null}
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.secondary,
    borderRadius: radius.card,
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  nameBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  nameHit: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  sourceTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.dominant,
  },
  sourceTagText: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.mutedText,
  },
  name: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: colors.text,
  },
  nameInput: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.borderFocused,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    fontSize: typography.body.fontSize,
    color: colors.text,
  },
  removeButton: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  removeText: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.destructive,
  },
  math: {
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  column: {
    flex: 1,
  },
  columnEnd: {
    flex: 1,
    alignItems: 'flex-end',
  },
  columnLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  valueHit: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  valueText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.text,
  },
  valueInput: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.borderFocused,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    fontSize: typography.body.fontSize,
    color: colors.text,
  },
  totalText: {
    minHeight: MIN_TOUCH_TARGET,
    fontSize: typography.display.fontSize,
    fontWeight: typography.display.fontWeight,
    lineHeight: typography.display.lineHeight,
    color: colors.text,
    textAlign: 'right',
  },
  priceUnknown: {
    color: colors.destructive,
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
  },
  badgeAmber: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.warning,
  },
  badgeRed: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.destructive,
  },
  deleteAction: {
    backgroundColor: colors.destructive,
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionPressed: {
    backgroundColor: colors.destructivePressed,
  },
});
