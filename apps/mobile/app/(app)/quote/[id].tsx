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
import { fetchQuote, QuoteLineItemResponse } from '../../../src/api/quotes';
import { QuoteDetail } from '../../../src/components/quotes/quote-detail';
import { isOnline } from '../../../src/sync/network-monitor';
import {
  loadQuoteDetail,
  remoteLineItemsToDraftJson,
  type QuoteDetailSnapshot,
} from '../../../src/quotes/load-quote-detail';
import { colors, spacing, typography } from '../../../src/theme/tokens';

export default function QuoteDetailScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [quote, setQuote] = useState<QuoteDetailSnapshot | null>(null);
  const [lineItems, setLineItems] = useState<QuoteLineItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function persistRemoteLineItems(
      items: QuoteLineItemResponse[],
    ): Promise<void> {
      const json = remoteLineItemsToDraftJson(items);
      const draftCollection = database.get<Draft>('drafts');
      const drafts = await draftCollection.query(Q.where('quote_id', id)).fetch();
      await database.write(async () => {
        if (drafts[0]) {
          await drafts[0].update((record) => {
            record.lineItemsJson = json;
          });
          return;
        }
        await draftCollection.create((record) => {
          record.quoteId = id;
          record.lineItemsJson = json;
        });
      });
    }

    async function load(): Promise<void> {
      const result = await loadQuoteDetail({
        findQuote: () => database.get<Quote>('quotes').find(id),
        findDrafts: () =>
          database.get<Draft>('drafts').query(Q.where('quote_id', id)).fetch(),
        fetchRemote: fetchQuote,
        isOnline,
        onLocalSnapshot: (local) => {
          if (cancelled || !local.quote) return;
          setQuote(local.quote);
          setLineItems(local.lineItems);
          setError('');
          setLoading(false);
        },
        persistRemoteLineItems,
      });

      if (cancelled) return;

      if (!result.found || !result.quote) {
        setError(result.error ?? 'Quote not found');
        setLoading(false);
        return;
      }

      setQuote(result.quote);
      setLineItems(result.lineItems);
      setError(result.error ?? '');
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
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
          createdAt: quote.createdAt,
          sentAt: quote.sentAt,
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
