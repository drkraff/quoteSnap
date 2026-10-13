import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { dollarsToCents } from '../../onboarding/profile';
import { UNIT_LABELS, unitChoices } from '../../catalog/units';
import { formatMoneyCents } from '../../money/currency';
import { useContractorLocale } from '../../money/use-contractor-locale';
import {
  ADD_LINE_LABEL,
  UNIT_PRICE_LABEL,
  parseLineQuantityInput,
} from '../../utils/line-items';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

export interface AddLineSuggestion {
  id: string;
  name: string;
  unitPriceCents: number;
  unit?: string;
}

export interface FreeTextLineDraft {
  name: string;
  quantity: number;
  unit: string | null;
  unitPriceCents: number | null;
}

interface AddLineSheetProps {
  visible: boolean;
  suggestions: AddLineSuggestion[];
  onFreeText: (line: FreeTextLineDraft) => void;
  onSelectSuggestion: (item: AddLineSuggestion) => void;
  onDismiss: () => void;
}

export function AddLineSheet({
  visible,
  suggestions,
  onFreeText,
  onSelectSuggestion,
  onDismiss,
}: AddLineSheetProps): JSX.Element {
  const locale = useContractorLocale();
  const screenHeight = Dimensions.get('window').height;
  const [name, setName] = useState('');
  const [qtyText, setQtyText] = useState('1');
  const [unit, setUnit] = useState<string | null>('each');
  const [priceText, setPriceText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const choices = unitChoices(locale.unitSystem, unit);

  useEffect(() => {
    if (visible) {
      setName('');
      setQtyText('1');
      setUnit('each');
      setPriceText('');
      setError(null);
    }
  }, [visible]);

  function submit(): void {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Enter a name for this line');
      return;
    }
    const quantity = parseLineQuantityInput(qtyText);
    if (quantity == null) {
      setError('Enter a quantity');
      return;
    }
    const trimmedPrice = priceText.trim();
    const unitPriceCents =
      trimmedPrice === '' ? null : dollarsToCents(trimmedPrice);
    if (trimmedPrice !== '' && unitPriceCents == null) {
      setError('Enter a unit price like 30 or 30.00, or leave it blank');
      return;
    }
    onFreeText({ name: trimmed, quantity, unit, unitPriceCents });
    onDismiss();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="Close add line" />
        <View style={[styles.sheet, { maxHeight: screenHeight * 0.85 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{ADD_LINE_LABEL}</Text>
          <Text style={styles.hint}>Type the line. A catalog is optional.</Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError(null);
              }}
              placeholder="Cable, labor, socket…"
              placeholderTextColor={colors.mutedText}
              accessibilityLabel="Line name"
              returnKeyType="next"
            />
            <Text style={styles.fieldLabel}>Qty</Text>
            <TextInput
              style={styles.input}
              value={qtyText}
              onChangeText={setQtyText}
              keyboardType="decimal-pad"
              accessibilityLabel="Quantity"
            />
            <Text style={styles.fieldLabel}>Unit</Text>
            <View style={styles.units}>
              {choices.map((choice) => {
                const selected = unit === choice;
                return (
                  <Pressable
                    key={choice}
                    style={[styles.unitChip, selected && styles.unitChipSelected]}
                    onPress={() => setUnit(choice)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={UNIT_LABELS[choice]}
                  >
                    <Text style={[styles.unitChipText, selected && styles.unitChipTextSelected]}>
                      {UNIT_LABELS[choice]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>{UNIT_PRICE_LABEL}</Text>
            <TextInput
              style={styles.input}
              value={priceText}
              onChangeText={setPriceText}
              keyboardType="decimal-pad"
              placeholder="Leave blank if you don't know yet"
              placeholderTextColor={colors.mutedText}
              accessibilityLabel={UNIT_PRICE_LABEL}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={styles.addButton}
              onPress={submit}
              accessibilityRole="button"
              accessibilityLabel={ADD_LINE_LABEL}
            >
              <Text style={styles.addButtonText}>{ADD_LINE_LABEL}</Text>
            </Pressable>
            {suggestions.length > 0 ? (
              <>
                <Text style={styles.suggestTitle}>Or pick from your catalog</Text>
                <FlatList
                  data={suggestions}
                  scrollEnabled={false}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const priceDisplay = formatMoneyCents(item.unitPriceCents, locale.currencyCode);
                    return (
                      <Pressable
                        style={({ pressed }) => [styles.itemRow, pressed && styles.itemRowPressed]}
                        onPress={() => {
                          onSelectSuggestion(item);
                          onDismiss();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${item.name}, unit price ${priceDisplay}`}
                      >
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemPrice}>{priceDisplay}</Text>
                      </Pressable>
                    );
                  }}
                />
              </>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.secondary,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  handle: {
    width: 32,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.heading.fontSize,
    fontWeight: typography.heading.fontWeight,
    lineHeight: typography.heading.lineHeight,
    color: colors.text,
  },
  hint: {
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.icon,
    backgroundColor: colors.dominant,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
    fontSize: typography.body.fontSize,
    color: colors.text,
  },
  units: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  unitChip: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.icon,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dominant,
  },
  unitChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.dominant,
  },
  unitChipText: {
    fontSize: typography.label.fontSize,
    color: colors.mutedText,
  },
  unitChipTextSelected: {
    color: colors.accent,
    fontWeight: '700',
  },
  error: {
    color: colors.errorText,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.sm,
  },
  addButton: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  addButtonText: {
    color: colors.text,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  suggestTitle: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.mutedText,
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemRowPressed: {
    backgroundColor: colors.secondary,
  },
  itemName: {
    flex: 1,
    fontSize: typography.body.fontSize,
    color: colors.text,
    marginRight: spacing.sm,
  },
  itemPrice: {
    fontSize: typography.label.fontSize,
    color: colors.mutedText,
  },
});
