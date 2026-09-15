import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import { dollarsToCents, parseMarkupPercentInput } from '../../onboarding/profile';
import {
  centsToDollarText,
  isLaborLine,
  resolveDraftPriceEdit,
} from '../../quotes/material-markup';
import { draftPriceFlag, draftPriceSourceLabel, type PriceSource } from '../../utils/price-source';
import { colors, spacing, typography } from '../../theme/tokens';

export type PriceEditSave = {
  unitPriceCents: number | null;
  priceSource: PriceSource;
  materialCostCents: number | null;
};

interface PriceEditSheetProps {
  visible: boolean;
  currentPriceCents: number | null;
  currentPriceSource?: PriceSource | null;
  currentMaterialCostCents?: number | null;
  markupPercent?: number | null;
  unit?: string | null;
  onSave: (result: PriceEditSave) => void;
  onDismiss: () => void;
}

export function PriceEditSheet({
  visible,
  currentPriceCents,
  currentPriceSource,
  currentMaterialCostCents,
  markupPercent,
  unit,
  onSave,
  onDismiss,
}: PriceEditSheetProps): JSX.Element {
  const labor = isLaborLine(unit);
  const [costText, setCostText] = useState('');
  const [markupText, setMarkupText] = useState('');
  const [unitPriceText, setUnitPriceText] = useState('');
  const [costOrMarkupEdited, setCostOrMarkupEdited] = useState(false);
  const [unitPriceManuallyEdited, setUnitPriceManuallyEdited] = useState(false);
  const [isFocused, setIsFocused] = useState<'cost' | 'markup' | 'price' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setCostText(centsToDollarText(currentMaterialCostCents));
      setMarkupText(
        markupPercent != null && Number.isInteger(markupPercent) ? String(markupPercent) : '',
      );
      setUnitPriceText(centsToDollarText(currentPriceCents));
      setCostOrMarkupEdited(false);
      setUnitPriceManuallyEdited(false);
      setError(null);
      setIsFocused(null);
    }
  }, [visible, currentPriceCents, currentMaterialCostCents, markupPercent]);

  const markupParsed = parseMarkupPercentInput(markupText);
  const parsedCost = costText.trim() === '' ? null : dollarsToCents(costText);
  const parsedManualPrice = unitPriceText.trim() === '' ? null : dollarsToCents(unitPriceText);

  const resolved = resolveDraftPriceEdit({
    costCents: parsedCost,
    markupPercent: markupParsed.ok ? markupParsed.value : null,
    unitPriceCents: unitPriceManuallyEdited ? parsedManualPrice : currentPriceCents,
    unitPriceManuallyEdited,
    costOrMarkupEdited,
    existingPriceSource: currentPriceSource,
    isLabor: labor,
  });

  const unitPriceDisplay = unitPriceManuallyEdited
    ? unitPriceText
    : centsToDollarText(resolved.unitPriceCents);

  const sourceLabel = draftPriceSourceLabel(
    draftPriceFlag(resolved.priceSource, resolved.unitPriceCents),
  );

  function handleSave(): void {
    if (costText.trim() !== '' && parsedCost == null) {
      setError('Cost must be greater than $0.00');
      return;
    }
    if (!markupParsed.ok) {
      setError('Markup must be an integer from 0 to 100');
      return;
    }
    if (unitPriceManuallyEdited && unitPriceText.trim() !== '' && parsedManualPrice == null) {
      setError('Price must be greater than $0.00');
      return;
    }

    setError(null);
    onSave({
      unitPriceCents: resolved.unitPriceCents,
      priceSource: resolved.priceSource,
      materialCostCents: parsedCost,
    });
  }

  const screenHeight = Dimensions.get('window').height;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <View style={[styles.sheet, { maxHeight: screenHeight * 0.8 }]}>
            <View style={styles.handle} />
            <Text style={styles.title}>Edit Price</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {!labor ? (
                <>
                  <Text style={styles.fieldLabel}>Material cost (optional)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      isFocused === 'cost' && styles.inputFocused,
                    ]}
                    keyboardType="decimal-pad"
                    value={costText}
                    onChangeText={(text) => {
                      setCostText(text);
                      setCostOrMarkupEdited(true);
                      setUnitPriceManuallyEdited(false);
                      if (error) setError(null);
                    }}
                    onFocus={() => setIsFocused('cost')}
                    onBlur={() => setIsFocused(null)}
                    placeholderTextColor={colors.mutedText}
                    placeholder="0.00"
                    accessibilityLabel="Material cost in dollars"
                  />

                  <Text style={styles.fieldLabel}>Markup %</Text>
                  <TextInput
                    style={[
                      styles.input,
                      isFocused === 'markup' && styles.inputFocused,
                    ]}
                    keyboardType="number-pad"
                    value={markupText}
                    onChangeText={(text) => {
                      setMarkupText(text);
                      setCostOrMarkupEdited(true);
                      setUnitPriceManuallyEdited(false);
                      if (error) setError(null);
                    }}
                    onFocus={() => setIsFocused('markup')}
                    onBlur={() => setIsFocused(null)}
                    placeholderTextColor={colors.mutedText}
                    placeholder="from your rate"
                    accessibilityLabel="Material markup percent"
                  />
                </>
              ) : null}

              <Text style={styles.fieldLabel}>Unit price</Text>
              <TextInput
                style={[
                  styles.input,
                  isFocused === 'price' && styles.inputFocused,
                  error !== null && styles.inputError,
                ]}
                keyboardType="decimal-pad"
                value={unitPriceDisplay}
                onChangeText={(text) => {
                  setUnitPriceText(text);
                  setUnitPriceManuallyEdited(true);
                  if (error) setError(null);
                }}
                onFocus={() => setIsFocused('price')}
                onBlur={() => setIsFocused(null)}
                placeholderTextColor={colors.mutedText}
                placeholder="0.00"
                accessibilityLabel="Price in dollars"
              />
              {sourceLabel ? (
                <Text style={styles.sourceLabel}>{sourceLabel}</Text>
              ) : null}

              {error !== null && (
                <Text style={styles.errorText}>{error}</Text>
              )}
            </ScrollView>

            <View style={styles.buttonRow}>
              <Pressable
                style={styles.discardButton}
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel="Discard price change"
              >
                <Text style={styles.discardText}>Discard</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.saveButtonPressed,
                ]}
                onPress={handleSave}
                accessibilityRole="button"
                accessibilityLabel="Save new price"
              >
                <Text style={styles.saveText}>Update Price</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  keyboardAvoid: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.dominant,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
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
    color: '#000000',
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: '#000000',
    marginBottom: spacing.sm,
  },
  inputFocused: {
    borderColor: colors.borderFocused,
  },
  inputError: {
    borderColor: colors.errorText,
  },
  sourceLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.mutedText,
    marginBottom: spacing.sm,
  },
  errorText: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.errorText,
    marginBottom: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  discardButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
  },
  saveButton: {
    flex: 1,
    height: 48,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonPressed: {
    opacity: 0.85,
  },
  saveText: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    color: '#ffffff',
  },
});
