import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Quote } from '../../db/models/quote';
import { StatusBadge } from './status-badge';
import { formatRelativeDate } from '../../utils/format-relative-date';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';
import { quoteRowDisplay } from '../../quotes/quote-row-display';
import type { QuoteRowSwipeAction } from '../../quotes/delete-local-quote';

export type { QuoteRowSwipeAction };

interface QuoteRowProps {
  quote: Quote;
  online: boolean;
  onPress: (quote: Quote) => void;
  swipeAction: QuoteRowSwipeAction;
  onSwipeAction: (quote: Quote) => void;
}

const SWIPE_ACTION_UI: Record<
  QuoteRowSwipeAction,
  { icon: 'archive-outline' | 'arrow-undo-outline' | 'trash-outline'; label: (phone: string) => string }
> = {
  archive: { icon: 'archive-outline', label: (phone) => `Archive quote ${phone}` },
  unarchive: { icon: 'arrow-undo-outline', label: (phone) => `Unarchive quote ${phone}` },
  delete: { icon: 'trash-outline', label: (phone) => `Delete quote ${phone}` },
};

export function QuoteRow({
  quote,
  online,
  onPress,
  swipeAction,
  onSwipeAction,
}: QuoteRowProps): JSX.Element {
  const {
    isAiProcessing,
    phone,
    totalDisplay,
    processingCaption,
    accessibilityLabel,
  } = quoteRowDisplay({
    status: quote.status,
    totalCents: quote.totalCents,
    customerPhone: quote.customerPhone,
    online,
  });
  const relativeDate = formatRelativeDate(quote.createdAt);

  function renderRightActions(): JSX.Element {
    const isUnarchive = swipeAction === 'unarchive';
    const ui = SWIPE_ACTION_UI[swipeAction];
    return (
      <Pressable
        style={({ pressed }) => [
          isUnarchive ? styles.unarchiveAction : styles.archiveAction,
          pressed && (isUnarchive ? styles.unarchiveActionPressed : styles.archiveActionPressed),
        ]}
        onPress={() => onSwipeAction(quote)}
        accessibilityRole="button"
        accessibilityLabel={ui.label(phone)}
      >
        <Ionicons name={ui.icon} size={24} color="#ffffff" />
      </Pressable>
    );
  }

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        style={({ pressed }) => [
          styles.row,
          isAiProcessing && styles.rowProcessing,
          pressed && !isAiProcessing && styles.rowPressed,
        ]}
        onPress={() => {
          if (!isAiProcessing) onPress(quote);
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={isAiProcessing}
      >
        {/* Left column: phone + date */}
        <View style={styles.leftColumn}>
          <Text style={styles.phone} numberOfLines={1}>
            {phone}
          </Text>
          <Text style={styles.date}>{relativeDate}</Text>
        </View>

        {/* Center: status badge */}
        <View style={styles.badgeWrap}>
          <StatusBadge status={quote.status} />
        </View>

        {/* Right: total price or processing indicator */}
        {isAiProcessing ? (
          <View style={styles.processingRight}>
            {processingCaption === 'Processing...' ? (
              <>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.processingText}>{processingCaption}</Text>
              </>
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={16} color={colors.mutedText} />
                <Text style={styles.processingText}>{processingCaption}</Text>
              </>
            )}
          </View>
        ) : (
          <Text style={styles.total}>{totalDisplay}</Text>
        )}
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.dominant,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowProcessing: {
    backgroundColor: colors.secondary,
  },
  rowPressed: {
    opacity: 0.7,
  },
  leftColumn: {
    flex: 1,
    marginRight: spacing.sm,
  },
  badgeWrap: {
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  phone: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: '#000000',
  },
  date: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginTop: 2,
  },
  total: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    color: '#000000',
    marginLeft: spacing.sm,
  },
  processingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: spacing.sm,
  },
  processingText: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  archiveAction: {
    backgroundColor: colors.destructive,
    width: 80,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveActionPressed: {
    backgroundColor: colors.destructivePressed,
  },
  unarchiveAction: {
    backgroundColor: colors.accent,
    width: 80,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unarchiveActionPressed: {
    opacity: 0.85,
  },
});
