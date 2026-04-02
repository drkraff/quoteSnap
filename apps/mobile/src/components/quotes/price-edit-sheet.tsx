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
} from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

interface PriceEditSheetProps {
  visible: boolean;
  currentPriceCents: number;
  onSave: (newPriceCents: number) => void;
  onDismiss: () => void;
}

export function PriceEditSheet({
  visible,
  currentPriceCents,
  onSave,
  onDismiss,
}: PriceEditSheetProps): JSX.Element {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill when sheet opens
  useEffect(() => {
    if (visible) {
      setInputValue((currentPriceCents / 100).toFixed(2));
      setError(null);
    }
  }, [visible, currentPriceCents]);

  function handleSave(): void {
    const stripped = inputValue.replace(/[$,]/g, '');
    const parsed = parseFloat(stripped);
    const newCents = Math.round(parsed * 100);

    if (isNaN(parsed) || newCents <= 0) {
      setError('Price must be greater than $0.00');
      return;
    }

    setError(null);
    onSave(newCents);
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
            {/* Drag handle */}
            <View style={styles.handle} />

            {/* Title */}
            <Text style={styles.title}>Edit Price</Text>

            {/* Price input */}
            <TextInput
              style={[
                styles.input,
                isFocused && styles.inputFocused,
                error !== null && styles.inputError,
              ]}
              keyboardType="decimal-pad"
              value={inputValue}
              onChangeText={(text) => {
                setInputValue(text);
                if (error) setError(null);
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholderTextColor={colors.mutedText}
              placeholder="0.00"
              accessibilityLabel="Price in dollars"
            />

            {/* Inline error */}
            {error !== null && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            {/* Buttons row */}
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
