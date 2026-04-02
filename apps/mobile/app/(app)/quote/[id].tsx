import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../../src/db';
import { Quote } from '../../../src/db/models/quote';
import { Draft } from '../../../src/db/models/draft';
import { parseLineItems } from '../../../src/utils/line-items';
import { fetchQuote, QuoteLineItemResponse } from '../../../src/api/quotes';
import { QuoteDetail } from '../../../src/components/quotes/quote-detail';
import { colors, spacing, typography } from '../../../src/theme/tokens';

export default function QuoteDetailScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [lineItems, setLineItems] = useState<QuoteLineItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load(): Promise<void> {
      const q = await database.get<Quote>('quotes').find(id);
      setQuote(q);
      if (q.serverId) {
        try {
          const detail = await fetchQuote(q.serverId);
          setLineItems(detail.lineItems);
        } catch {
          setError('Connect to the internet to view full details');
        }
      } else {
        // No server ID yet — load from local draft as fallback
        const drafts = await database
          .get<Draft>('drafts')
          .query(Q.where('quote_id', id))
          .fetch();
        if (drafts[0]) {
          const items = parseLineItems(drafts[0].lineItemsJson);
          setLineItems(
            items.map((item, i) => ({
              id: String(i),
              name: item.name,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
            })),
          );
        }
      }
      setLoading(false);
    }
    void load();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error && lineItems.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!quote) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Quote not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <QuoteDetail
        quote={{
          status: quote.status,
          customerPhone: quote.customerPhone,
          totalCents: quote.totalCents,
          createdAt: quote.createdAt.toISOString(),
          sentAt: quote.sentAt?.toISOString() ?? null,
        }}
        lineItems={lineItems}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dominant,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.dominant,
  },
  errorText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
    textAlign: 'center',
  },
});
