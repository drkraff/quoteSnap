import { Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { deadLetterBannerMessage } from '../../sync/dead-letter';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../theme/tokens';

interface DeadLetterBannerProps {
  count: number;
  onPress: () => void;
}

export function DeadLetterBanner({ count, onPress }: DeadLetterBannerProps): JSX.Element | null {
  const message = deadLetterBannerMessage(count);
  if (message == null) return null;

  return (
    <Pressable
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={message}
    >
      <Ionicons name="warning" size={20} color={colors.destructive} />
      <Text style={styles.message}>{message}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  pressed: {
    opacity: 0.85,
  },
  message: {
    flex: 1,
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
    color: colors.destructive,
  },
});
