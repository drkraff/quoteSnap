import { View, Text, FlatList, StyleSheet } from 'react-native';
import { StatusBadge } from './status-badge';
import { formatRelativeDate } from '../../utils/format-relative-date';
import { colors, spacing, typography } from '../../theme/tokens';

interface LineItemDisplay {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

interface QuoteDetailProps {
  quote: {
    status: string;
    customerPhone: string | null;
    totalCents: number;
    createdAt: string;
    sentAt: string | null;
  };
  lineItems: LineItemDisplay[];
}

export function QuoteDetail({ quote, lineItems }: QuoteDetailProps): JSX.Element {
  const totalDisplay = `$${(quote.totalCents / 100).toFixed(2)}`;
  const createdDate = formatRelativeDate(new Date(quote.createdAt));
  const phone = quote.customerPhone || 'No phone';

  function renderLineItem({ item }: { item: LineItemDisplay }): JSX.Element {
    const itemTotal = `$${((item.quantity * item.unitPriceCents) / 100).toFixed(2)}`;
    return (
      <View style={styles.lineItemRow}>
        <Text style={styles.lineItemName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.lineItemQty}>{`x${item.quantity}`}</Text>
        <Text style={styles.lineItemPrice}>{itemTotal}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <StatusBadge status={quote.status} />
        <Text style={styles.phone}>{phone}</Text>
        <Text style={styles.date}>{createdDate}</Text>
        {quote.sentAt && (
          <Text style={styles.date}>
            {`Sent ${formatRelativeDate(new Date(quote.sentAt))}`}
          </Text>
        )}
      </View>

      {/* Line items */}
      <FlatList
        data={lineItems}
        keyExtractor={(item) => item.id}
        renderItem={renderLineItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No items</Text>
        }
        scrollEnabled={false}
      />

      {/* Footer: total */}
      <View style={styles.footer}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>{totalDisplay}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.dominant,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  phone: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: '#000000',
    marginTop: spacing.sm,
  },
  date: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  lineItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.dominant,
  },
  lineItemName: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: '#000000',
    marginRight: spacing.sm,
  },
  lineItemQty: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginRight: spacing.sm,
    minWidth: 32,
    textAlign: 'center',
  },
  lineItemPrice: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    color: '#000000',
    minWidth: 72,
    textAlign: 'right',
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  emptyText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: '#000000',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    color: '#000000',
  },
});
