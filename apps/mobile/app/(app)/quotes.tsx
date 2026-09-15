import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { database } from '../../src/db';
import { Quote } from '../../src/db/models/quote';
import { Draft } from '../../src/db/models/draft';
import { SyncQueueItem } from '../../src/db/models/sync-queue-item';
import { enqueue } from '../../src/sync/sync-queue';
import { useAuthStore } from '../../src/store/auth-store';
import { QuoteRow } from '../../src/components/quotes/quote-row';
import { QuotesEmptyState } from '../../src/components/quotes/empty-state';
import { QuotesListModeToggle } from '../../src/components/quotes/list-mode-toggle';
import { DeadLetterBanner } from '../../src/components/sync/dead-letter-banner';
import { DraftReadyToast } from '../../src/components/voice/draft-ready-toast';
import { useDeadLetterItems } from '../../src/sync/use-dead-letter-items';
import { useIsOnline } from '../../src/sync/use-is-online';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { getVoiceStatus, getDraftLineItems } from '../../src/api/voice';
import { fetchQuote } from '../../src/api/quotes';
import { rememberServerRevision } from '../../src/sync/server-revision';
import { quotePressTarget } from '../../src/quotes/status-display';
import {
  ARCHIVE_QUOTE_CONFIRM_MESSAGE,
  ARCHIVE_QUOTE_CONFIRM_TITLE,
  UNARCHIVE_QUOTE_CONFIRM_MESSAGE,
  UNARCHIVE_QUOTE_CONFIRM_TITLE,
  archiveQuoteSyncPayload,
  unarchiveQuoteSyncPayload,
} from '../../src/quotes/archive-quote';
import {
  DELETE_LOCAL_QUOTE_CONFIRM_MESSAGE,
  DELETE_LOCAL_QUOTE_CONFIRM_TITLE,
  canHardDeleteLocalQuote,
  quoteRowSwipeAction,
  shouldDropQueueItemForDeletedLocalQuote,
} from '../../src/quotes/delete-local-quote';
import {
  ACTIVE_QUOTES_HEADER_TITLE,
  ARCHIVED_QUOTES_HEADER_TITLE,
  type QuotesListMode,
} from '../../src/quotes/list-mode';
import {
  draftFailedLocalFields,
  draftReadyLocalFields,
  QUOTE_LIST_OBSERVE_COLUMNS,
  quoteListRenderKey,
} from '../../src/quotes/quote-list-observe';
import {
  pollOneAiProcessingQuote,
  shouldPollAiProcessing,
  shouldRunQuotesAiPoller,
} from '../../src/quotes/poll-ai-processing';
import { audioRetryInFlight } from '../../src/quotes/retry-voice-quote';
import { useResumeAfterCrashPrompt } from '../../src/quotes/use-resume-prompt';

// Tab bar height constant (safe default for both iOS/Android)
const TAB_BAR_HEIGHT = 56;

export default function QuotesScreen(): JSX.Element {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [listMode, setListMode] = useState<QuotesListMode>('active');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [readyDraftId, setReadyDraftId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadLetterItems = useDeadLetterItems();
  const online = useIsOnline();
  const showArchived = listMode === 'archived';
  const navigateResume = useCallback((href: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(href as any);
  }, [router]);
  useResumeAfterCrashPrompt(navigateResume);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: showArchived ? ARCHIVED_QUOTES_HEADER_TITLE : ACTIVE_QUOTES_HEADER_TITLE,
    });
  }, [navigation, showArchived]);

  useEffect(() => {
    const contractorId = useAuthStore.getState().contractor?.id ?? '';
    const archiveClause = showArchived
      ? Q.where('is_archived', true)
      : Q.or(Q.where('is_archived', false), Q.where('is_archived', null));
    const subscription = database
      .get<Quote>('quotes')
      .query(
        Q.where('contractor_id', contractorId),
        archiveClause,
        Q.sortBy('created_at', 'desc'),
      )
      .observeWithColumns(QUOTE_LIST_OBSERVE_COLUMNS)
      .subscribe(setQuotes);
    return () => subscription.unsubscribe();
  }, [showArchived]);

  // Polling for ai_processing quotes (job id, or serverId so we can recover one)
  useEffect(() => {
    const processingQuotes = quotes.filter(shouldPollAiProcessing);

    if (!shouldRunQuotesAiPoller(quotes, online)) {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      return;
    }

    async function pollProcessing(): Promise<void> {
      let queueItems: SyncQueueItem[] = [];
      try {
        queueItems = await database.get<SyncQueueItem>('sync_queue_items').query().fetch();
      } catch {
        queueItems = [];
      }
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
              async markDraftReady(_quote, lineItemsJson, clientSentence, roomsJson) {
                const ready = draftReadyLocalFields(lineItemsJson);
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
                    r.status = ready.status;
                    r.totalCents = ready.totalCents;
                    if (clientSentence !== undefined) {
                      r.clientSentence = clientSentence;
                    }
                    if (roomsJson) {
                      r.roomsJson = roomsJson;
                    }
                  });
                });
              },
              async markFailed(_quote, lineItemsJson, clientSentence, roomsJson) {
                const failed = draftFailedLocalFields(lineItemsJson);
                await database.write(async () => {
                  const draftCollection = database.get<Draft>('drafts');
                  const drafts = await draftCollection.query(Q.where('quote_id', q.id)).fetch();
                  if (drafts.length > 0) {
                    await drafts[0]!.update((d) => {
                      d.lineItemsJson = lineItemsJson;
                    });
                  }
                  await q.update((r) => {
                    r.status = failed.status;
                    r.totalCents = failed.totalCents;
                    if (clientSentence !== undefined) {
                      r.clientSentence = clientSentence;
                    }
                    if (roomsJson) {
                      r.roomsJson = roomsJson;
                    }
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
            {
              audioRetryInFlight: audioRetryInFlight(queueItems, q.id),
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

    pollTimerRef.current = setTimeout(() => { void pollProcessing(); }, 1500);

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [quotes, online]);

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

  function confirmArchiveQuote(quote: Quote): void {
    Alert.alert(ARCHIVE_QUOTE_CONFIRM_TITLE, ARCHIVE_QUOTE_CONFIRM_MESSAGE, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () => {
          void persistArchiveFlag(quote, true);
        },
      },
    ]);
  }

  function confirmUnarchiveQuote(quote: Quote): void {
    Alert.alert(UNARCHIVE_QUOTE_CONFIRM_TITLE, UNARCHIVE_QUOTE_CONFIRM_MESSAGE, [
      { text: 'Keep archived', style: 'cancel' },
      {
        text: 'Unarchive',
        onPress: () => {
          void persistArchiveFlag(quote, false);
        },
      },
    ]);
  }

  function confirmDeleteLocalQuote(quote: Quote): void {
    Alert.alert(DELETE_LOCAL_QUOTE_CONFIRM_TITLE, DELETE_LOCAL_QUOTE_CONFIRM_MESSAGE, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void handleDeleteLocalQuote(quote);
        },
      },
    ]);
  }

  async function handleDeleteLocalQuote(quote: Quote): Promise<void> {
    try {
      const drafts = await database.get<Draft>('drafts').query(Q.where('quote_id', quote.id)).fetch();
      if (
        !canHardDeleteLocalQuote({
          serverId: quote.serverId,
          status: quote.status,
          totalCents: quote.totalCents,
          lineItemsJson: drafts[0]?.lineItemsJson ?? '[]',
        })
      ) {
        return;
      }
      const draftIds = drafts.map((draft) => draft.id);
      const queueByQuoteId = await database
        .get<SyncQueueItem>('sync_queue_items')
        .query(Q.where('entity_id', quote.id))
        .fetch();
      const queueByDraftId: SyncQueueItem[] = [];
      for (const draftId of draftIds) {
        const items = await database
          .get<SyncQueueItem>('sync_queue_items')
          .query(Q.where('entity_id', draftId))
          .fetch();
        queueByDraftId.push(...items);
      }
      const queueItems = [...queueByQuoteId, ...queueByDraftId];
      await database.write(async () => {
        for (const item of queueItems) {
          if (shouldDropQueueItemForDeletedLocalQuote(item, quote.id, draftIds)) {
            await item.destroyPermanently();
          }
        }
        for (const draft of drafts) {
          await draft.destroyPermanently();
        }
        await quote.destroyPermanently();
      });
    } catch {
      // Stay on the list; swipe again to retry
    }
  }

  async function persistArchiveFlag(quote: Quote, isArchived: boolean): Promise<void> {
    try {
      await database.write(async () => {
        await quote.update((record) => {
          record.isArchived = isArchived;
          record.updatedAt = new Date();
        });
      });
      await enqueue({
        entityType: 'quote',
        entityId: quote.id,
        action: 'update',
        payload: isArchived ? archiveQuoteSyncPayload() : unarchiveQuoteSyncPayload(),
      });
    } catch {
      // Stay on the list; swipe again to retry
    }
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
          r.isArchived = false;
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

  function swipeHandlerFor(action: ReturnType<typeof quoteRowSwipeAction>): (quote: Quote) => void {
    if (action === 'delete') return confirmDeleteLocalQuote;
    if (action === 'unarchive') return confirmUnarchiveQuote;
    return confirmArchiveQuote;
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={quotes}
        extraData={quoteListRenderKey(quotes, online)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const swipeAction = quoteRowSwipeAction(
            listMode,
            canHardDeleteLocalQuote({
              serverId: item.serverId,
              status: item.status,
              totalCents: item.totalCents,
            }),
          );
          return (
            <QuoteRow
              quote={item}
              online={online}
              onPress={handleQuotePress}
              swipeAction={swipeAction}
              onSwipeAction={swipeHandlerFor(swipeAction)}
            />
          );
        }}
        ListHeaderComponent={
          <>
            <DeadLetterBanner
              count={deadLetterItems.length}
              onPress={() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                router.push('/sync-issues' as any);
              }}
            />
            <QuotesListModeToggle mode={listMode} onChange={setListMode} />
          </>
        }
        ListEmptyComponent={<QuotesEmptyState archived={showArchived} />}
        contentContainerStyle={
          quotes.length === 0
            ? styles.emptyContent
            : {
                paddingBottom: showArchived
                  ? insets.bottom + TAB_BAR_HEIGHT + 16
                  : insets.bottom + TAB_BAR_HEIGHT + 16 + 56 + spacing.sm + 56 + 16,
              }
        }
      />

      <DraftReadyToast
        visible={readyDraftId !== null}
        draftId={readyDraftId}
        onDismiss={() => setReadyDraftId(null)}
      />

      {!showArchived && (
        <>
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
        </>
      )}
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
