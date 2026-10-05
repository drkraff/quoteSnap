import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { QuoteStatsView } from '../../src/components/quotes/quote-stats-view';
import { database } from '../../src/db';
import { Quote } from '../../src/db/models/quote';
import {
  DEFAULT_QUOTE_STATS_WINDOW,
  QUOTE_STATS_OBSERVE_COLUMNS,
  computeQuoteStats,
  quoteStatsView,
  type QuoteStatsQuote,
  type QuoteStatsWindowId,
} from '../../src/quotes/quote-stats';
import { useAuthStore } from '../../src/store/auth-store';
import { colors } from '../../src/theme/tokens';

function toStatsQuote(quote: Quote): QuoteStatsQuote {
  return {
    status: quote.status,
    totalCents: quote.totalCents,
    createdAt: quote.createdAt,
    sentAt: quote.sentAt,
    isArchived: quote.isArchived,
  };
}

export default function StatsScreen(): JSX.Element {
  const [windowId, setWindowId] = useState<QuoteStatsWindowId>(DEFAULT_QUOTE_STATS_WINDOW);
  const [quotes, setQuotes] = useState<QuoteStatsQuote[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const contractorId = useAuthStore.getState().contractor?.id ?? '';
    const subscription = database
      .get<Quote>('quotes')
      .query(Q.where('contractor_id', contractorId))
      .observeWithColumns([...QUOTE_STATS_OBSERVE_COLUMNS])
      .subscribe((rows) => {
        setQuotes(rows.map(toStatsQuote));
        setReady(true);
      });
    return () => subscription.unsubscribe();
  }, []);

  const view = quoteStatsView(computeQuoteStats(quotes, windowId, new Date()));

  return (
    <SafeAreaView style={styles.container}>
      {ready ? (
        <ScrollView contentContainerStyle={view.empty ? styles.emptyScroll : undefined}>
          <QuoteStatsView view={view} onWindowChange={setWindowId} />
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dominant,
  },
  emptyScroll: {
    flexGrow: 1,
  },
});
