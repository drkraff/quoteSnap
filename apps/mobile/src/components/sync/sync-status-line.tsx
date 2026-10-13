import { Pressable, Text, StyleSheet } from 'react-native';
import { syncStatusView } from '../../sync/sync-status';
import { useSyncQueueCounts } from '../../sync/use-sync-queue-counts';
import { useIsOnline } from '../../sync/use-is-online';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../theme/tokens';

interface SyncStatusLineProps {
  onRetry: () => void;
}

/** One sentence for saved / synced / failed. Replaces the header warning icon. */
export function SyncStatusLine({ onRetry }: SyncStatusLineProps): JSX.Element {
  const online = useIsOnline();
  const counts = useSyncQueueCounts();
  const view = syncStatusView({
    online,
    pendingCount: counts.pendingCount,
    deadLetterCount: counts.deadLetterCount,
  });

  const body = (
    <Text
      style={[styles.message, view.kind === 'failed' && styles.failed]}
    >
      {view.message}
    </Text>
  );

  if (!view.tappable) {
    return (
      <Text
        style={[styles.line, styles.message]}
        accessibilityRole="text"
        accessibilityLabel={view.message}
      >
        {view.message}
      </Text>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.line, pressed && styles.pressed]}
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel={view.message}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  message: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  failed: {
    color: colors.errorText,
  },
});
