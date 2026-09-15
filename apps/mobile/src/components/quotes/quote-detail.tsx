import { View, Text, FlatList, StyleSheet } from 'react-native';
import { StatusBadge } from './status-badge';
import { formatRelativeDate } from '../../utils/format-relative-date';
import { formatQuantityLabel, formatUnitPriceLabel, isUnknownUnitPrice } from '../../utils/line-items';
import { draftPriceFlag, draftPriceSourceLabel } from '../../utils/price-source';
import { colors, spacing, typography } from '../../theme/tokens';
import { PRIVATE_NOTE_INTERNAL_HINT, PRIVATE_NOTE_LABEL, hasPrivateNote, normalizePrivateNote } from '../../quotes/private-notes';
import {
  CLIENT_SENTENCE_HINT,
  CLIENT_SENTENCE_LABEL,
} from '../../quotes/client-sentence';
import { optionBadgeLabel } from '../../quotes/option-groups';
import { draftListRows, UNGROUPED_ROOM_LABEL } from '../../quotes/rooms';
import { PhotoStrip } from './photo-strip';
import type { QuotePhoto } from '../../quotes/photos';
import { photosForLine, photosForQuote, photosForRoom } from '../../quotes/photos';

interface LineItemDisplay {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  unit?: string | null;
  privateNote?: string | null;
  priceSource?: string | null;
  optionGroupId?: string | null;
  optionRole?: string | null;
  roomId?: string | null;
  clientId?: string | null;
}

interface QuoteDetailProps {
  quote: {
    status: string;
    customerPhone: string | null;
    totalCents: number;
    createdAt: string;
    sentAt: string | null;
    privateNote?: string | null;
    clientSentence?: string | null;
    rooms?: { id: string; name: string; privateNote?: string | null }[];
    photos?: QuotePhoto[];
  };
  lineItems: LineItemDisplay[];
}

export function QuoteDetail({ quote, lineItems }: QuoteDetailProps): JSX.Element {
  const totalDisplay = `$${(quote.totalCents / 100).toFixed(2)}`;
  const createdDate = formatRelativeDate(new Date(quote.createdAt));
  const phone = quote.customerPhone || 'No phone';
  const photos = quote.photos ?? [];
  const groupedRows = draftListRows(
    quote.rooms ?? [],
    lineItems.map((item) => ({
      catalogItemId: '',
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      unit: item.unit,
      privateNote: item.privateNote,
      priceSource: undefined,
      optionGroupId: item.optionGroupId ?? undefined,
      optionRole: item.optionRole === 'base' || item.optionRole === 'alt' ? item.optionRole : undefined,
      roomId: item.roomId ?? undefined,
    })),
  );

  function renderLineItem(item: LineItemDisplay): JSX.Element {
    const priceUnknown = isUnknownUnitPrice(item.unitPriceCents);
    const flag = draftPriceFlag(item.priceSource, item.unitPriceCents);
    const sourceLabel = draftPriceSourceLabel(flag);
    const itemTotal = priceUnknown
      ? formatUnitPriceLabel(item.unitPriceCents)
      : `$${(((item.unitPriceCents ?? 0) * item.quantity) / 100).toFixed(2)}`;
    const optionLabel = optionBadgeLabel(item.optionRole);
    return (
      <View>
        <View style={[styles.lineItemRow, priceUnknown && styles.lineItemUnknown, item.optionRole === 'alt' && styles.lineItemAlt]}>
          <View style={styles.lineItemNameColumn}>
            <Text style={styles.lineItemName} numberOfLines={2}>
              {item.name}
            </Text>
            {optionLabel ? (
              <Text style={[styles.optionLabel, item.optionRole === 'alt' && styles.optionLabelAlt]}>
                {optionLabel}
              </Text>
            ) : null}
          </View>
          <Text style={styles.lineItemQty}>{`x${formatQuantityLabel(item.quantity, item.unit)}`}</Text>
          <View style={styles.lineItemPriceColumn}>
            <Text style={[styles.lineItemPrice, priceUnknown && styles.lineItemPriceUnknown]}>
              {itemTotal}
            </Text>
            {sourceLabel ? (
              <Text style={styles.priceSourceLabel}>{sourceLabel}</Text>
            ) : null}
          </View>
        </View>
        {hasPrivateNote(item.privateNote) ? (
          <View style={styles.lineNote}>
            <Text style={styles.internalHint}>{PRIVATE_NOTE_INTERNAL_HINT}</Text>
            <Text style={styles.noteBody}>{normalizePrivateNote(item.privateNote)}</Text>
          </View>
        ) : null}
        <PhotoStrip photos={item.clientId ? photosForLine(photos, item.clientId) : []} />
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

      {quote.clientSentence ? (
        <View style={styles.clientSentence}>
          <Text style={styles.noteLabel}>{CLIENT_SENTENCE_LABEL}</Text>
          <Text style={styles.clientHint}>{CLIENT_SENTENCE_HINT}</Text>
          <Text style={styles.noteBody}>{quote.clientSentence}</Text>
        </View>
      ) : null}

      {hasPrivateNote(quote.privateNote) ? (
        <View style={styles.jobNote}>
          <Text style={styles.noteLabel}>{PRIVATE_NOTE_LABEL}</Text>
          <Text style={styles.internalHint}>{PRIVATE_NOTE_INTERNAL_HINT}</Text>
          <Text style={styles.noteBody}>{normalizePrivateNote(quote.privateNote)}</Text>
        </View>
      ) : null}

      <PhotoStrip photos={photosForQuote(photos)} />

      {/* Line items grouped by room when rooms exist; single-memo stays flat. */}
      <FlatList
        data={groupedRows}
        keyExtractor={(row, index) =>
          row.kind === 'line' ? `line-${row.index}` : `${row.kind}-${index}`
        }
        renderItem={({ item: row }) => {
          if (row.kind === 'room') {
            return (
              <View style={styles.roomHeader}>
                <Text style={styles.roomHeaderText}>{row.room.name}</Text>
                {hasPrivateNote(row.room.privateNote) ? (
                  <Text style={styles.internalHint}>{normalizePrivateNote(row.room.privateNote)}</Text>
                ) : null}
                <PhotoStrip photos={photosForRoom(photos, row.room.id)} />
              </View>
            );
          }
          if (row.kind === 'ungrouped') {
            return (
              <View style={styles.roomHeader}>
                <Text style={styles.roomHeaderText}>{UNGROUPED_ROOM_LABEL}</Text>
              </View>
            );
          }
          const display = lineItems[row.index];
          return display ? renderLineItem(display) : <View />;
        }}
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
  lineItemNameColumn: {
    flex: 1,
    marginRight: spacing.sm,
  },
  lineItemName: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: '#000000',
  },
  optionLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
    color: colors.accent,
    marginTop: 2,
  },
  optionLabelAlt: {
    color: colors.mutedText,
  },
  lineItemAlt: {
    backgroundColor: colors.secondary,
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
  lineItemPriceColumn: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  lineItemPriceUnknown: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: 18,
    color: colors.destructive,
  },
  lineItemUnknown: {
    borderLeftWidth: 4,
    borderLeftColor: colors.destructive,
  },
  priceSourceLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.mutedText,
    marginTop: 2,
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
  jobNote: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.secondary,
    gap: spacing.xs,
  },
  clientSentence: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.dominant,
    gap: spacing.xs,
  },
  roomHeader: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  roomHeaderText: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
    color: '#333333',
  },
  lineNote: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.secondary,
    gap: spacing.xs,
  },
  noteLabel: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: '#000000',
  },
  internalHint: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  clientHint: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  noteBody: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: '#000000',
  },
});
