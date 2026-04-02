import { useState, useEffect } from 'react';
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { database } from '../../src/db';
import { Quote } from '../../src/db/models/quote';
import { Draft } from '../../src/db/models/draft';
import { enqueue } from '../../src/sync/sync-queue';
import { useAuthStore } from '../../src/store/auth-store';
import { QuoteRow } from '../../src/components/quotes/quote-row';
import { EmptyState } from '../../src/components/catalog/empty-state';
import { colors } from '../../src/theme/tokens';

export default function QuotesScreen(): JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const contractorId = useAuthStore.getState().contractor?.id ?? '';
    const collection = database.get<Quote>('quotes');
    const subscription = collection
      .query(
        Q.where('contractor_id', contractorId),
        Q.sortBy('created_at', 'desc'),
      )
      .observe()
      .subscribe(setQuotes);
    return () => subscription.unsubscribe();
  }, []);

  function handleQuotePress(quote: Quote): void {
    if (quote.status === 'draft_local') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(`/draft/${quote.id}` as any);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(`/quote/${quote.id}` as any);
    }
  }

  async function handleFabPress(): Promise<void> {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const contractorId = useAuthStore.getState().contractor?.id ?? '';
      const quoteCollection = database.get<Quote>('quotes');
      const draftCollection = database.get<Draft>('drafts');
      let newQuoteId: string = '';
      await database.write(async () => {
        const newQuote = await quoteCollection.create((r) => {
          r.contractorId = contractorId;
          r.status = 'draft_local';
          r.totalCents = 0;
        });
        newQuoteId = newQuote.id;
        await draftCollection.create((r) => {
          r.quoteId = newQuote.id;
          r.lineItemsJson = '[]';
        });
      });
      await enqueue({
        entityType: 'quote',
        entityId: newQuoteId,
        action: 'create',
        payload: { status: 'draft_local', totalCents: 0 },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(`/draft/${newQuoteId}` as any);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={quotes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <QuoteRow quote={item} onPress={handleQuotePress} />
        )}
        ListEmptyComponent={
          <EmptyState onAddItem={() => { void handleFabPress(); }} />
        }
        contentContainerStyle={quotes.length === 0 ? styles.emptyContent : undefined}
      />
      <Pressable
        style={[
          styles.fab,
          { bottom: insets.bottom + 16 },
          isCreating && styles.fabDisabled,
        ]}
        onPress={() => { void handleFabPress(); }}
        accessibilityLabel="Create new quote"
        accessibilityRole="button"
        disabled={isCreating}
      >
        <Ionicons name="add" size={24} color="#ffffff" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dominant,
  },
  emptyContent: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabDisabled: {
    opacity: 0.6,
  },
});
