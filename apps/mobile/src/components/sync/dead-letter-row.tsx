import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { DEAD_LETTER_RETRY_LABEL, type DeadLetterListItem } from '../../sync/dead-letter';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../theme/tokens';

interface DeadLetterRowProps {
  item: DeadLetterListItem;
  retrying: boolean;
  onRetry: () => void;
}

export function DeadLetterRow({ item, retrying, onRetry }: DeadLetterRowProps): JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.summary}>{item.summary}</Text>
        <Text style={styles.error}>{item.error}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.retry,
          pressed && !retrying && styles.retryPressed,
          retrying && styles.retryDisabled,
        ]}
        onPress={onRetry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityLabel={`${DEAD_LETTER_RETRY_LABEL} ${item.title}`}
      >
        {retrying ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.retryLabel}>{DEAD_LETTER_RETRY_LABEL}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.dominant,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: '#000000',
  },
  summary: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginTop: 2,
  },
  error: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.destructive,
    marginTop: 4,
  },
  retry: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: 72,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryPressed: {
    opacity: 0.85,
  },
  retryDisabled: {
    opacity: 0.6,
  },
  retryLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: '#ffffff',
  },
});
