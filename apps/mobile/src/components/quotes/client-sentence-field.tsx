import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';
import {
  CLIENT_SENTENCE_HINT,
  CLIENT_SENTENCE_LABEL,
  CLIENT_SENTENCE_MAX_LENGTH,
  CLIENT_SENTENCE_PLACEHOLDER,
} from '../../quotes/client-sentence';

interface ClientSentenceFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  editable?: boolean;
  onBlur?: () => void;
}

export function ClientSentenceField({
  value,
  onChangeText,
  editable = true,
  onBlur,
}: ClientSentenceFieldProps): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{CLIENT_SENTENCE_LABEL}</Text>
      <Text style={styles.hint}>{CLIENT_SENTENCE_HINT}</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputReadonly]}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        editable={editable}
        multiline
        maxLength={CLIENT_SENTENCE_MAX_LENGTH}
        placeholder={CLIENT_SENTENCE_PLACEHOLDER}
        placeholderTextColor={colors.mutedText}
        accessibilityLabel={`${CLIENT_SENTENCE_LABEL}. ${CLIENT_SENTENCE_HINT}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.dominant,
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
