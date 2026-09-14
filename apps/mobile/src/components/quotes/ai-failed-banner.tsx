import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';
import type { AiFailedRecoveryView } from '../../quotes/ai-failed-recovery';

interface AiFailedBannerProps {
  view: AiFailedRecoveryView;
  retryDisabled?: boolean;
  onRetry: () => void;
  onRecordAgain: () => void;
  onAddItems: () => void;
}

export function AiFailedBanner({
  view,
  retryDisabled = false,
  onRetry,
  onRecordAgain,
  onAddItems,
}: AiFailedBannerProps): JSX.Element {
  const secondary = view.showRetry
    ? {
        label: view.retryLabel,
        onPress: onRetry,
        accessibilityLabel: 'Retry original recording',
        disabled: retryDisabled,
      }
    : {
        label: view.recordAgainLabel,
        onPress: onRecordAgain,
        accessibilityLabel: 'Record voice quote again',
        disabled: false,
      };

  return (
    <View style={styles.banner}>
      <Text style={styles.title}>{view.title}</Text>
      <Text style={styles.body}>{view.body}</Text>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.pressed,
            secondary.disabled && styles.disabled,
          ]}
          onPress={secondary.onPress}
          disabled={secondary.disabled}
          accessibilityRole="button"
          accessibilityLabel={secondary.accessibilityLabel}
          accessibilityState={{ disabled: secondary.disabled }}
        >
          <Text style={styles.secondaryLabel}>{secondary.label}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
          onPress={onAddItems}
          accessibilityRole="button"
          accessibilityLabel="Add items from catalog"
        >
          <Text style={styles.primaryLabel}>{view.manualLabel}</Text>
        </Pressable>
      </View>
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
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: colors.destructive,
  },
  body: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  primaryButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  primaryLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: '#ffffff',
  },
  secondaryButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 8,
    backgroundColor: colors.dominant,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  secondaryLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.mutedText,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
});
