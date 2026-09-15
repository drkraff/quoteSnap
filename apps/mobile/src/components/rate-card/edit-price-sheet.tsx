import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RateCardEntryResponse } from '../../api/rate-card';
import { parseCatalogUnit } from '../../catalog/units';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

interface EditRatePriceSheetProps {
  visible: boolean;
  entry: RateCardEntryResponse | null;
  onSave: (unitPriceCents: number) => void;
  onClose: () => void;
}

export function EditRatePriceSheet({
  visible,
  entry,
  onSave,
  onClose,
}: EditRatePriceSheetProps): JSX.Element {
  const [priceDisplay, setPriceDisplay] = useState('');
  const [priceCents, setPriceCents] = useState(0);
  const [priceFocused, setPriceFocused] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    if (entry) {
      const dollars = (entry.unitPriceCents / 100).toFixed(2);
      setPriceDisplay(dollars);
      setPriceCents(entry.unitPriceCents);
    }
  }, [entry]);

  useEffect(() => {
    if (!visible) {
      setPriceDisplay('');
      setPriceCents(0);
      setHasSubmitted(false);
      setPriceFocused(false);
    }
  }, [visible]);

  const priceError =
    hasSubmitted && priceCents <= 0 ? 'Enter a price greater than $0' : null;
  const isValid = priceCents > 0;
  const unitLabel = entry ? (parseCatalogUnit(entry.unit) ?? entry.unit) : '';

  function handlePriceChange(text: string): void {
    const stripped = text.replace(/[^0-9.]/g, '');
    const parts = stripped.split('.');
    const normalized =
      parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : stripped;
    const finalDisplay = normalized.includes('.')
      ? normalized.slice(0, normalized.indexOf('.') + 3)
      : normalized;

    setPriceDisplay(finalDisplay);
    const parsed = parseFloat(finalDisplay);
    if (!isNaN(parsed) && parsed > 0) {
      setPriceCents(Math.round(parsed * 100));
    } else {
      setPriceCents(0);
    }
  }

  function handleSavePress(): void {
    setHasSubmitted(true);
    if (!isValid) return;
    onSave(priceCents);
  }

  const screenHeight = Dimensions.get('window').height;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <View style={[styles.sheet, { maxHeight: screenHeight * 0.8 }]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>Edit price</Text>
              <Pressable
                onPress={onClose}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Ionicons name="close" size={24} color="#333333" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {entry ? (
                <Text style={styles.identity}>
                  {entry.displayName}
                  {' · '}
                  {unitLabel}
                </Text>
              ) : null}

              <View style={styles.fieldGroup}>
                <View
                  style={[
                    styles.priceRow,
                    priceFocused && styles.priceRowFocused,
                    priceError && styles.priceRowError,
                  ]}
                >
                  <Text style={styles.currencyPrefix}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedText}
                    keyboardType="decimal-pad"
                    value={priceDisplay}
                    onChangeText={handlePriceChange}
                    onFocus={() => setPriceFocused(true)}
                    onBlur={() => setPriceFocused(false)}
                    accessibilityLabel="Price in dollars"
                  />
                </View>
                {priceError ? <Text style={styles.errorText}>{priceError}</Text> : null}
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.saveButton,
                  !isValid && styles.saveButtonDisabled,
                  pressed && isValid && styles.saveButtonPressed,
                ]}
                onPress={handleSavePress}
                disabled={hasSubmitted && !isValid}
                accessibilityRole="button"
                accessibilityLabel="Save price"
                accessibilityState={{ disabled: hasSubmitted && !isValid }}
              >
                <Text style={styles.saveButtonText}>Save price</Text>
              </Pressable>
            </ScrollView>
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
    paddingBottom: spacing['3xl'],
  },
  handle: {
    width: 32,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: typography.heading.fontSize,
    fontWeight: typography.heading.fontWeight,
    lineHeight: typography.heading.lineHeight,
    color: '#000000',
  },
  closeButton: {
    padding: spacing.xs,
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
  },
  identity: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
    marginBottom: spacing.md,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    color: colors.errorText,
    marginTop: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
  },
  priceRowFocused: {
    borderColor: colors.borderFocused,
  },
  priceRowError: {
    borderColor: colors.errorText,
  },
  currencyPrefix: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: '#000000',
    marginRight: spacing.xs,
  },
  priceInput: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: '#000000',
    paddingVertical: spacing.sm,
  },
  saveButton: {
    backgroundColor: colors.accent,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonPressed: {
    opacity: 0.85,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
