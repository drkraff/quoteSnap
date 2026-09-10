import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  REVIEW_BEFORE_SENDING,
  REVIEW_BEFORE_SENDING_ACK,
  REVIEW_BEFORE_SENDING_BODY,
} from '../../sync/draft-conflict';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

interface ReviewBeforeSendingBannerProps {
  onAcknowledge: () => void;
}

export function ReviewBeforeSendingBanner({
  onAcknowledge,
}: ReviewBeforeSendingBannerProps): JSX.Element {
  return (
    <View
      style={styles.banner}
      accessibilityRole="summary"
      accessibilityLabel={REVIEW_BEFORE_SENDING}
    >
      <Text style={styles.title}>{REVIEW_BEFORE_SENDING}</Text>
      <Text style={styles.body}>{REVIEW_BEFORE_SENDING_BODY}</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={onAcknowledge}
        accessibilityRole="button"
        accessibilityLabel={REVIEW_BEFORE_SENDING_ACK}
      >
        <Text style={styles.buttonLabel}>{REVIEW_BEFORE_SENDING_ACK}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: colors.warning,
  },
  body: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  button: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  buttonLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.85,
  },
});
