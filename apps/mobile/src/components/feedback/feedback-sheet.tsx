import { useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  FEEDBACK_CANCEL,
  FEEDBACK_CONTEXT_HINT,
  FEEDBACK_FAILED,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_PLACEHOLDER,
  FEEDBACK_RATING_LABEL,
  FEEDBACK_SCREENSHOT_LABEL,
  FEEDBACK_SEND,
  FEEDBACK_SHEET_HINT,
  SEND_FEEDBACK_LABEL,
} from '../../feedback/copy';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export type FeedbackSheetSubmit = {
  message: string;
  rating: number | null;
  includeScreenshot: boolean;
};

type FeedbackSheetProps = {
  visible: boolean;
  screenshotBase64: string | null;
  submitting: boolean;
  notice: string | null;
  onDismiss: () => void;
  onSubmit: (input: FeedbackSheetSubmit) => void;
};

export function FeedbackSheet({
  visible,
  screenshotBase64,
  submitting,
  notice,
  onDismiss,
  onSubmit,
}: FeedbackSheetProps): JSX.Element {
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const screenHeight = Dimensions.get('window').height;
  const canSend = message.trim().length > 0 && !submitting;

  useEffect(() => {
    if (visible) {
      setMessage('');
      setRating(null);
      setIncludeScreenshot(screenshotBase64 !== null);
    }
  }, [visible, screenshotBase64]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <View style={[styles.sheet, { maxHeight: screenHeight * 0.86 }]}>
            <View style={styles.handle} />
            <Text style={styles.title}>{SEND_FEEDBACK_LABEL}</Text>
            <Text style={styles.hint}>{FEEDBACK_SHEET_HINT}</Text>
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={FEEDBACK_MESSAGE_MAX}
              placeholder={FEEDBACK_PLACEHOLDER}
              placeholderTextColor={colors.mutedText}
              accessibilityLabel={SEND_FEEDBACK_LABEL}
              editable={!submitting}
            />
            <Text style={styles.ratingLabel}>{FEEDBACK_RATING_LABEL}</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((value) => {
                const selected = rating === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => {
                      if (submitting) return;
                      setRating(selected ? null : value);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`How useful: ${value} of 5`}
                    accessibilityState={{ selected }}
                    style={[styles.rating, selected && styles.ratingSelected]}
                  >
                    <Text style={[styles.ratingText, selected && styles.ratingTextSelected]}>{value}</Text>
                  </Pressable>
                );
              })}
            </View>
            {screenshotBase64 ? (
              <Pressable
                onPress={() => {
                  if (!submitting) setIncludeScreenshot((current) => !current);
                }}
                accessibilityRole="checkbox"
                accessibilityLabel={FEEDBACK_SCREENSHOT_LABEL}
                accessibilityState={{ checked: includeScreenshot }}
                style={styles.screenshotRow}
              >
                <Image
                  source={{ uri: `data:image/jpeg;base64,${screenshotBase64}` }}
                  style={[styles.preview, !includeScreenshot && styles.previewOff]}
                  accessibilityIgnoresInvertColors
                />
                <Text style={styles.screenshotText}>{FEEDBACK_SCREENSHOT_LABEL}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.context}>{FEEDBACK_CONTEXT_HINT}</Text>
            {notice ? (
              <Text style={notice === FEEDBACK_FAILED ? styles.noticeFailed : styles.notice}>{notice}</Text>
            ) : null}
            <View style={styles.buttonRow}>
              <Pressable
                style={styles.cancelButton}
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel={FEEDBACK_CANCEL}
              >
                <Text style={styles.cancelText}>{FEEDBACK_CANCEL}</Text>
              </Pressable>
              <Pressable
                style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
                onPress={() => {
                  if (!canSend) return;
                  onSubmit({ message, rating, includeScreenshot: includeScreenshot && screenshotBase64 !== null });
                }}
                accessibilityRole="button"
                accessibilityLabel={FEEDBACK_SEND}
                accessibilityState={{ disabled: !canSend }}
              >
                <Text style={styles.sendText}>{submitting ? 'Sending…' : FEEDBACK_SEND}</Text>
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
    backgroundColor: colors.secondary,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
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
    color: colors.text,
  },
  hint: {
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.icon,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body.fontSize,
    color: colors.text,
    textAlignVertical: 'top',
    backgroundColor: colors.dominant,
    marginBottom: spacing.md,
  },
  ratingLabel: {
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginBottom: spacing.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  rating: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.dominant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingSelected: {
    borderColor: colors.accent,
  },
  ratingText: {
    color: colors.mutedText,
    fontSize: typography.body.fontSize,
  },
  ratingTextSelected: {
    color: colors.text,
    fontWeight: '700',
  },
  screenshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  preview: {
    width: 44,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.dominant,
  },
  previewOff: {
    opacity: 0.35,
  },
  screenshotText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
  },
  context: {
    color: colors.mutedText,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.sm,
  },
  notice: {
    color: colors.success,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    marginBottom: spacing.sm,
  },
  noticeFailed: {
    color: colors.errorText,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    marginBottom: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.mutedText,
    fontSize: typography.body.fontSize,
  },
  sendButton: {
    flex: 1,
    height: 48,
    backgroundColor: colors.accent,
    borderRadius: radius.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.dominant,
  },
  sendText: {
    color: colors.text,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
