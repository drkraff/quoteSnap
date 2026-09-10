import { useState, useEffect, useRef } from 'react';
import {
  Text,
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
import { QuotesEmptyState } from '../../src/components/quotes/empty-state';
import { DeadLetterBanner } from '../../src/components/sync/dead-letter-banner';
import { DraftReadyToast } from '../../src/components/voice/draft-ready-toast';
import { useDeadLetterItems } from '../../src/sync/use-dead-letter-items';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { getVoiceStatus, getDraftLineItems } from '../../src/api/voice';
import { fetchQuote } from '../../src/api/quotes';
import { isOnline } from '../../src/sync/network-monitor';
import { rememberServerRevision } from '../../src/sync/server-revision';
import { quotePressTarget } from '../../src/quotes/status-display';
import {
  pollOneAiProcessingQuote,
  shouldPollAiProcessing,
} from '../../src/quotes/poll-ai-processing';

// Tab bar height constant (safe default for both iOS/Android)
const TAB_BAR_HEIGHT = 56;

export default function QuotesScreen(): JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [readyDraftId, setReadyDraftId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadLetterItems = useDeadLetterItems();

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

  // Polling for ai_processing quotes (job id, or serverId so we can recover one)
  useEffect(() => {
    const processingQuotes = quotes.filter(shouldPollAiProcessing);

    if (processingQuotes.length === 0) {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      return;
    }

    async function pollProcessing(): Promise<void> {
      for (const q of processingQuotes) {
        try {
          const outcome = await pollOneAiProcessingQuote(
            {
              id: q.id,
              status: q.status,
              serverId: q.serverId,
              voiceJobId: q.voiceJobId,
            },
            {
              getVoiceStatus,
              fetchQuote,
              getDraftLineItems,
              async markDraftReady(_quote, lineItemsJson) {
                await database.write(async () => {
                  // Write line items JSON to the draft record BEFORE updating quote status
                  const draftCollection = database.get<Draft>('drafts');
                  const drafts = await draftCollection.query(Q.where('quote_id', q.id)).fetch();
                  if (drafts.length > 0) {
                    const draft = drafts[0]!;
                    await draft.update((d) => {
                      d.lineItemsJson = lineItemsJson;
                    });
                  }
                  await q.update((r) => {
                    r.status = 'draft_local';
                  });
                });
              },
              async markFailed() {
                await database.write(async () => {
                  await q.update((r) => {
                    r.status = 'ai_failed';
                  });
                });
              },
              async stampVoiceJobId(_quote, jobId) {
                await database.write(async () => {
                  await q.update((r) => {
                    r.voiceJobId = jobId;
                  });
                });
              },
            },
          );
          if (outcome === 'draft_ready') {
            setReadyDraftId(q.id);
            const serverId = q.serverId;
            if (serverId) {
              void fetchQuote(serverId)
                .then((remote) => {
                  rememberServerRevision(serverId, remote.quote.updatedAt);
                })
                .catch(() => {
                  // Offline — next hydrate/GET will stamp the revision.
                });
            }
          }
        } catch {
          // Network / DB error — will retry next poll
        }
      }
      pollTimerRef.current = setTimeout(() => { void pollProcessing(); }, 1500);
    }

    if (isOnline()) {
      pollTimerRef.current = setTimeout(() => { void pollProcessing(); }, 1500);
    }

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [quotes]);

  function handleQuotePress(quote: Quote): void {
    const target = quotePressTarget(quote.status);
    if (target === 'none') return;

    if (target === 'draft') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(`/draft/${quote.id}` as any);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(`/quote/${quote.id}` as any);
  }

  async function handleManualQuotePress(): Promise<void> {
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
        ListHeaderComponent={
          <DeadLetterBanner
            count={deadLetterItems.length}
            onPress={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              router.push('/sync-issues' as any);
            }}
          />
        }
        ListEmptyComponent={<QuotesEmptyState />}
        contentContainerStyle={
          quotes.length === 0
            ? styles.emptyContent
            : {
                paddingBottom:
                  insets.bottom + TAB_BAR_HEIGHT + 16 + 56 + spacing.sm + 56 + 16,
              }
        }
      />

      <DraftReadyToast
        visible={readyDraftId !== null}
        draftId={readyDraftId}
        onDismiss={() => setReadyDraftId(null)}
      />

      {/* Manual Quote FAB — above voice FAB */}
      <Pressable
        style={[
          styles.manualFab,
          { bottom: insets.bottom + TAB_BAR_HEIGHT + 16 + 56 + spacing.sm },
          isCreating && styles.fabDisabled,
        ]}
        onPress={() => { void handleManualQuotePress(); }}
        accessibilityLabel="Create manual quote"
        accessibilityRole="button"
        disabled={isCreating}
      >
        <Ionicons name="create-outline" size={24} color={colors.mutedText} />
        <Text style={styles.manualFabLabel}>Manual Quote</Text>
      </Pressable>

      {/* Voice Quote FAB — bottom, primary */}
      <Pressable
        style={[
          styles.voiceFab,
          { bottom: insets.bottom + TAB_BAR_HEIGHT + 16 },
        ]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPress={() => { router.push('/voice-record' as any); }}
        accessibilityLabel="Start voice quote"
        accessibilityRole="button"
      >
        <Ionicons name="mic-outline" size={24} color="#ffffff" />
        <Text style={styles.voiceFabLabel}>Voice Quote</Text>
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
  voiceFab: {
    position: 'absolute',
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: spacing.md,
    borderRadius: 28,
    backgroundColor: colors.accent,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  voiceFabLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: spacing.sm,
  },
  manualFab: {
    position: 'absolute',
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: spacing.md,
    borderRadius: 28,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  manualFabLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.mutedText,
    marginLeft: spacing.sm,
  },
  fabDisabled: {
    opacity: 0.6,
  },
});
