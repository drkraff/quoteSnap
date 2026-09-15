import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';
import {
  PRIVATE_NOTE_INTERNAL_HINT,
  PRIVATE_NOTE_LABEL,
  PRIVATE_NOTE_MAX_LENGTH,
} from '../../quotes/private-notes';

interface PrivateNoteFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  editable?: boolean;
  onBlur?: () => void;
}

export function PrivateNoteField({
  value,
  onChangeText,
  editable = true,
  onBlur,
}: PrivateNoteFieldProps): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{PRIVATE_NOTE_LABEL}</Text>
      <Text style={styles.hint}>{PRIVATE_NOTE_INTERNAL_HINT}</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputReadonly]}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        editable={editable}
        multiline
        maxLength={PRIVATE_NOTE_MAX_LENGTH}
        placeholder="Visible only to you — never sent to the customer"
        placeholderTextColor={colors.mutedText}
        accessibilityLabel={`${PRIVATE_NOTE_LABEL}. ${PRIVATE_NOTE_INTERNAL_HINT}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: '#000000',
  },
  hint: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  input: {
    marginTop: spacing.xs,
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: typography.body.fontSize,
    color: '#000000',
    textAlignVertical: 'top',
    backgroundColor: colors.secondary,
  },
  inputReadonly: {
    backgroundColor: colors.secondary,
  },
});
