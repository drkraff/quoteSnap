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
import {
  PRIVATE_NOTE_INTERNAL_HINT,
  PRIVATE_NOTE_LABEL,
  PRIVATE_NOTE_MAX_LENGTH,
} from '../../quotes/private-notes';

interface PrivateNoteSheetProps {
  visible: boolean;
  lineName: string;
  currentNote: string | null;
  onSave: (note: string | null) => void;
  onDismiss: () => void;
}

export function PrivateNoteSheet({
  visible,
  lineName,
  currentNote,
  onSave,
  onDismiss,
}: PrivateNoteSheetProps): JSX.Element {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (visible) {
      setInputValue(currentNote ?? '');
    }
  }, [visible, currentNote]);

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
            <Text style={styles.title}>{PRIVATE_NOTE_LABEL}</Text>
            <Text style={styles.hint}>{PRIVATE_NOTE_INTERNAL_HINT}</Text>
            <Text style={styles.lineName} numberOfLines={2}>
              {lineName}
            </Text>
            <TextInput
              style={styles.input}
              value={inputValue}
              onChangeText={setInputValue}
              multiline
              maxLength={PRIVATE_NOTE_MAX_LENGTH}
              placeholder="Visible only to you — never sent to the customer"
              placeholderTextColor={colors.mutedText}
              accessibilityLabel={`${PRIVATE_NOTE_LABEL}. ${PRIVATE_NOTE_INTERNAL_HINT}`}
            />
            <View style={styles.buttonRow}>
              <Pressable
                style={styles.discardButton}
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel="Discard private note"
              >
                <Text style={styles.discardText}>Discard</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.saveButtonPressed,
                ]}
                onPress={() => onSave(inputValue)}
                accessibilityRole="button"
                accessibilityLabel="Save private note"
              >
                <Text style={styles.saveText}>Save note</Text>
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
  lineName: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: '#000000',
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body.fontSize,
    color: '#000000',
    textAlignVertical: 'top',
    backgroundColor: colors.secondary,
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
