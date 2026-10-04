import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  FOLLOW_UP_DISMISS_LABEL,
  FOLLOW_UP_EMPTY_HEADING,
  FOLLOW_UP_FILTER_LABEL,
  FOLLOW_UP_MARK_LABEL,
  followUpEmptyBody,
  type FollowUpRowView,
} from '../../quotes/follow-up';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../theme/tokens';

interface FollowUpFilterChipProps {
  selected: boolean;
  count: number;
  onPress: () => void;
}

export function FollowUpFilterChip({
  selected,
  count,
  onPress,
}: FollowUpFilterChipProps): JSX.Element {
  const accessibilityLabel = count > 0
    ? `${FOLLOW_UP_FILTER_LABEL}, ${count}`
    : FOLLOW_UP_FILTER_LABEL;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {FOLLOW_UP_FILTER_LABEL}
      </Text>
      {count > 0 ? (
        <View style={styles.count}>
          <Text style={styles.countText}>{String(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function FollowUpEmptyState(): JSX.Element {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyHeading}>{FOLLOW_UP_EMPTY_HEADING}</Text>
      <Text style={styles.emptyBody}>{followUpEmptyBody()}</Text>
    </View>
  );
}

interface FollowUpRowProps {
  view: FollowUpRowView;
  onPress: () => void;
  onMarkFollowedUp: () => void;
  onDismiss: () => void;
}

export function FollowUpRow({
  view,
  onPress,
  onMarkFollowedUp,
  onDismiss,
}: FollowUpRowProps): JSX.Element {
  const identity = view.customerName ?? view.customerPhone;
  const accessibilityLabel = identity
    ? `${identity}, total ${view.totalDisplay}, ${view.sentLabel}`
    : `Total ${view.totalDisplay}, ${view.sentLabel}`;
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.summary, pressed && styles.summaryPressed]}
      >
        {view.customerName ? (
          <Text style={styles.name} numberOfLines={1}>
            {view.customerName}
          </Text>
        ) : null}
        {view.customerPhone ? (
          <Text style={styles.phone} numberOfLines={1}>
            {view.customerPhone}
          </Text>
        ) : null}
        <View style={styles.meta}>
          <Text style={styles.total}>{view.totalDisplay}</Text>
          <Text style={styles.sent}>{view.sentLabel}</Text>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          onPress={onMarkFollowedUp}
          accessibilityRole="button"
          accessibilityLabel={FOLLOW_UP_MARK_LABEL}
          style={({ pressed }) => [styles.action, styles.mark, pressed && styles.actionPressed]}
        >
          <Text style={styles.markText}>{FOLLOW_UP_MARK_LABEL}</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={FOLLOW_UP_DISMISS_LABEL}
          style={({ pressed }) => [styles.action, styles.dismiss, pressed && styles.actionPressed]}
        >
          <Text style={styles.dismissText}>{FOLLOW_UP_DISMISS_LABEL}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH_TARGET,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
  },
  chipSelected: {
    backgroundColor: colors.dominant,
    borderColor: colors.accent,
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  chipLabelSelected: {
    color: colors.accent,
  },
  count: {
    marginLeft: spacing.sm,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  countText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyHeading: {
    fontSize: typography.heading.fontSize,
    fontWeight: typography.heading.fontWeight,
    lineHeight: typography.heading.lineHeight,
    color: '#000000',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.dominant,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summary: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  summaryPressed: {
    opacity: 0.7,
  },
  name: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: '#000000',
    marginBottom: spacing.xs,
  },
  phone: {
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginBottom: spacing.xs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  total: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: '#000000',
  },
  sent: {
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginLeft: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  action: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
  },
  mark: {
    backgroundColor: colors.accent,
    marginRight: spacing.sm,
  },
  dismiss: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionPressed: {
    opacity: 0.85,
  },
  markText: {
    color: '#ffffff',
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    textAlign: 'center',
  },
  dismissText: {
    color: colors.mutedText,
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    textAlign: 'center',
  },
});
