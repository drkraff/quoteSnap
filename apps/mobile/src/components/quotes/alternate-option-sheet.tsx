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
import { ADD_ALTERNATE_LABEL } from '../../quotes/option-groups';

interface AlternateOptionSheetProps {
  visible: boolean;
  baseName: string;
  onSave: (value: { name: string; unitPriceCents: number | null }) => void;
  onDismiss: () => void;
}

export function AlternateOptionSheet({
  visible,
  baseName,
  onSave,
  onDismiss,
}: AlternateOptionSheetProps): JSX.Element {
  const [name, setName] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName('');
      setPriceInput('');
      setError(null);
    }
  }, [visible]);

  function handleSave(): void {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Enter a name for the alternate');
      return;
    }
    const stripped = priceInput.replace(/[$,]/g, '').trim();
    let unitPriceCents: number | null = null;
    if (stripped !== '') {
      const parsed = parseFloat(stripped);
      const cents = Math.round(parsed * 100);
      if (isNaN(parsed) || cents < 0 || !Number.isFinite(cents)) {
        setError('Price must be a number, or leave blank');
        return;
      }
      unitPriceCents = cents === 0 ? null : cents;
    }
    setError(null);
    onSave({ name: trimmed, unitPriceCents });
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
            <Text style={styles.title}>{ADD_ALTERNATE_LABEL}</Text>
            <Text style={styles.hint} numberOfLines={2}>
              {`Instead of ${baseName || 'this item'}. One pair only — not a package.`}
            </Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (error) setError(null);
              }}
              placeholder="Keep the tub"
              placeholderTextColor={colors.mutedText}
              accessibilityLabel="Alternate option name"
            />
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={priceInput}
              onChangeText={(text) => {
                setPriceInput(text);
                if (error) setError(null);
              }}
              placeholder="Price (optional — leave blank if unknown)"
              placeholderTextColor={colors.mutedText}
              accessibilityLabel="Alternate price in dollars. Optional"
            />
            {error !== null && (
              <Text style={styles.errorText}>{error}</Text>
            )}
            <View style={styles.buttonRow}>
              <Pressable
                style={styles.discardButton}
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel="Discard alternate"
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
                accessibilityLabel="Save alternate option"
              >
                <Text style={styles.saveText}>Add alternate</Text>
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
  },
  hint: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body.fontSize,
    color: '#000000',
    marginBottom: spacing.sm,
    minHeight: 44,
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
