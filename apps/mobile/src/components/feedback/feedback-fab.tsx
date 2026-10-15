import { Pressable, StyleSheet, Text } from 'react-native';
import { SEND_FEEDBACK_LABEL } from '../../feedback/copy';
import { useFeedback } from '../../feedback/feedback-context';
import { colors, spacing, typography } from '../../theme/tokens';

type FeedbackFabProps = {
  edge?: 'top' | 'bottom';
  offset?: number;
  quoteId?: string | null;
};

/** Quiet pill on draft and quote so a note is one tap away from the work. */
export function FeedbackFab({ edge = 'bottom', offset = 24, quoteId }: FeedbackFabProps): JSX.Element {
  const { open } = useFeedback();
  return (
    <Pressable
      onPress={() => {
        void open({ quoteId });
      }}
      accessibilityRole="button"
      accessibilityLabel={SEND_FEEDBACK_LABEL}
      style={({ pressed }) => [
        styles.fab,
        edge === 'top' ? { top: offset } : { bottom: offset },
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.label}>Feedback</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.md,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  pressed: {
    backgroundColor: colors.dominant,
  },
  label: {
    color: colors.mutedText,
    fontSize: typography.label.fontSize,
  },
});
