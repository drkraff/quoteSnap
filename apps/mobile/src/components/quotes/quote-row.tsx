import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Quote } from '../../db/models/quote';
import { formatRelativeDate } from '../../utils/format-relative-date';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';
import { quoteRowDisplay } from '../../quotes/quote-row-display';
import { DUPLICATE_QUOTE_A11Y, DUPLICATE_QUOTE_LABEL } from '../../quotes/duplicate-quote';
import type { QuoteRowSwipeAction } from '../../quotes/delete-local-quote';

export type { QuoteRowSwipeAction };

interface QuoteRowProps {
  quote: Quote;
  online: boolean;
  onPress: (quote: Quote) => void;
  swipeAction: QuoteRowSwipeAction;
  onSwipeAction: (quote: Quote) => void;
  onDuplicate: (quote: Quote) => void;
  duplicateDisabled?: boolean;
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
  onDuplicate,
  duplicateDisabled = false,
}: QuoteRowProps): JSX.Element {
  const {
    isAiProcessing,
    phone,
    totalDisplay,
    processingCaption,
    statusLabel,
    accessibilityLabel,
  } = quoteRowDisplay({
    status: quote.status,
    totalCents: quote.totalCents,
    customerPhone: quote.customerPhone,
    voiceJobId: quote.voiceJobId,
    online,
  });
  const relativeDate = formatRelativeDate(quote.createdAt);
  const subtitle = isAiProcessing
    ? (processingCaption ?? 'Processing...')
    : `${statusLabel} · ${totalDisplay}`;

  function renderLeftActions(): JSX.Element {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.duplicateAction,
          (pressed || duplicateDisabled) && styles.duplicateActionPressed,
        ]}
        onPress={() => {
          if (duplicateDisabled) return;
          onDuplicate(quote);
        }}
        disabled={duplicateDisabled}
        accessibilityRole="button"
        accessibilityLabel={`${DUPLICATE_QUOTE_A11Y} ${phone}`}
        accessibilityState={{ disabled: duplicateDisabled }}
      >
        <Ionicons name="copy-outline" size={22} color={colors.text} />
        <Text style={styles.duplicateLabel}>{DUPLICATE_QUOTE_LABEL}</Text>
      </Pressable>
    );
  }

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
        <Ionicons name={ui.icon} size={24} color={colors.text} />
      </Pressable>
    );
  }

  return (
    <Swipeable
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      overshootLeft={false}
      overshootRight={false}
    >
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
        <View style={styles.copy}>
          <Text style={styles.phone} numberOfLines={1}>
            {phone}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Text style={styles.time}>{relativeDate}</Text>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.dominant,
  },
  rowProcessing: {
    backgroundColor: colors.dominant,
  },
  rowPressed: {
    backgroundColor: colors.secondary,
  },
  copy: {
    flex: 1,
    marginRight: spacing.md,
  },
  phone: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  time: {
    fontSize: typography.label.fontSize,
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
  duplicateAction: {
    backgroundColor: colors.accent,
    width: 88,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  duplicateActionPressed: {
    opacity: 0.85,
  },
  duplicateLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 2,
  },
});
