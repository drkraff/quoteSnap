import { useState, useEffect, useRef } from 'react';
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
import { CatalogItem } from '../../db/models/catalog-item';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

const UNITS = ['each', 'hour', 'foot', 'sqft', 'job'] as const;
type Unit = (typeof UNITS)[number];

interface ItemFormSheetProps {
  visible: boolean;
  editingItem: CatalogItem | null;
  onSave: (data: { name: string; unit: string; unitPriceCents: number }) => void;
  onClose: () => void;
}

export function ItemFormSheet({
  visible,
  editingItem,
  onSave,
  onClose,
}: ItemFormSheetProps): JSX.Element {
  const [name, setName] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [priceDisplay, setPriceDisplay] = useState('');
  const [priceCents, setPriceCents] = useState(0);
  const [nameFocused, setNameFocused] = useState(false);
  const [priceFocused, setPriceFocused] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const nameInputRef = useRef<TextInput>(null);

  // Pre-fill when editingItem changes
  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setSelectedUnit((editingItem.unit as Unit) ?? null);
      const dollars = (editingItem.unitPriceCents / 100).toFixed(2);
      setPriceDisplay(dollars);
      setPriceCents(editingItem.unitPriceCents);
    }
  }, [editingItem]);

  // Reset when sheet closes
  useEffect(() => {
    if (!visible) {
      setName('');
      setSelectedUnit(null);
      setPriceDisplay('');
      setPriceCents(0);
      setHasSubmitted(false);
      setNameFocused(false);
      setPriceFocused(false);
    }
  }, [visible]);

  const nameError = hasSubmitted && name.trim().length === 0 ? 'Name is required' : null;
  const unitError = hasSubmitted && selectedUnit === null ? 'Select a unit' : null;
  const priceError =
    hasSubmitted && priceCents <= 0 ? 'Enter a price greater than $0' : null;

  const isValid = name.trim().length > 0 && selectedUnit !== null && priceCents > 0;

  function handlePriceChange(text: string): void {
    // Strip everything except digits and one decimal point
    const stripped = text.replace(/[^0-9.]/g, '');
    const parts = stripped.split('.');
    const normalized =
      parts.length > 2
        ? parts[0] + '.' + parts.slice(1).join('')
        : stripped;

    // Limit to 2 decimal places
    const finalDisplay =
      normalized.includes('.')
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
    if (!isValid || !selectedUnit) return;

    onSave({
      name: name.trim(),
      unit: selectedUnit,
      unitPriceCents: priceCents,
    });
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
            {/* Drag handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>
                {editingItem ? 'Edit Item' : 'Add Item'}
              </Text>
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
              {/* Name field */}
              <View style={styles.fieldGroup}>
                <TextInput
                  ref={nameInputRef}
                  style={[
                    styles.textInput,
                    nameFocused && styles.textInputFocused,
                    nameError && styles.textInputError,
                  ]}
                  placeholder="Item name"
                  placeholderTextColor={colors.mutedText}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                  }}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setNameFocused(false)}
                  maxLength={200}
                  accessibilityLabel="Item name"
                />
                {nameError && (
                  <Text style={styles.errorText}>{nameError}</Text>
                )}
              </View>

              {/* Unit field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Unit</Text>
                <View style={styles.unitRow}>
                  {UNITS.map((unit) => {
                    const isSelected = selectedUnit === unit;
                    return (
                      <Pressable
                        key={unit}
                        style={[
                          styles.unitPill,
                          isSelected && styles.unitPillSelected,
                        ]}
                        onPress={() => setSelectedUnit(unit)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isSelected }}
                        accessibilityLabel={unit}
                      >
                        <Text
                          style={[
                            styles.unitPillText,
                            isSelected && styles.unitPillTextSelected,
                          ]}
                        >
                          {unit}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {unitError && (
                  <Text style={styles.errorText}>{unitError}</Text>
                )}
              </View>

              {/* Price field */}
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
                {priceError && (
                  <Text style={styles.errorText}>{priceError}</Text>
                )}
              </View>

              {/* Save button */}
              <Pressable
                style={({ pressed }) => [
                  styles.saveButton,
                  !isValid && styles.saveButtonDisabled,
                  pressed && isValid && styles.saveButtonPressed,
                ]}
                onPress={handleSavePress}
                disabled={hasSubmitted && !isValid}
                accessibilityRole="button"
                accessibilityLabel="Save Item"
                accessibilityState={{ disabled: hasSubmitted && !isValid }}
              >
                <Text style={styles.saveButtonText}>Save Item</Text>
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
  fieldGroup: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: '#333333',
    marginBottom: spacing.xs,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: '#000000',
    minHeight: MIN_TOUCH_TARGET,
  },
  textInputFocused: {
    borderColor: colors.borderFocused,
  },
  textInputError: {
    borderColor: colors.errorText,
  },
  errorText: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    color: colors.errorText,
    marginTop: spacing.xs,
  },
  unitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  unitPill: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitPillSelected: {
    backgroundColor: colors.accent,
  },
  unitPillText: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    color: '#333333',
  },
  unitPillTextSelected: {
    color: '#ffffff',
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
