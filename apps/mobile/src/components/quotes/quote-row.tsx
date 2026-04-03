import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Quote } from '../../db/models/quote';
import { StatusBadge } from './status-badge';
import { formatRelativeDate } from '../../utils/format-relative-date';
import { colors, spacing, typography } from '../../theme/tokens';
import { isOnline } from '../../sync/network-monitor';

interface QuoteRowProps {
  quote: Quote;
  onPress: (quote: Quote) => void;
}

export function QuoteRow({ quote, onPress }: QuoteRowProps): JSX.Element {
  const isAiProcessing = quote.status === 'ai_processing';
  const online = isOnline();

  const phone = isAiProcessing ? 'New job' : (quote.customerPhone || 'No phone');
  const totalDisplay = `$${(quote.totalCents / 100).toFixed(2)}`;
  const relativeDate = formatRelativeDate(quote.createdAt);

  const accessibilityLabel = isAiProcessing
    ? online
      ? 'Quote processing'
      : 'Quote queued, will upload when online'
    : `Quote status ${quote.status}, total ${totalDisplay}. Double tap to open.`;

  return (
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
      <StatusBadge status={quote.status} />

      {/* Right: total price or processing indicator */}
      {isAiProcessing ? (
        <View style={styles.processingRight}>
          {online ? (
            <>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.processingText}>Processing...</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={16} color={colors.mutedText} />
              <Text style={styles.processingText}>Queued</Text>
            </>
          )}
        </View>
      ) : (
        <Text style={styles.total}>{totalDisplay}</Text>
      )}
    </Pressable>
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
});
