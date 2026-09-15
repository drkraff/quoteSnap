import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { serializeRooms } from '../../../src/quotes/rooms';
import { normalizePrivateNote } from '../../../src/quotes/private-notes';
import { mergePhotosOnHydrate, parsePhotosJson, serializePhotos } from '../../../src/quotes/photos';
import { useAuthStore } from '../../../src/store/auth-store';
import {
  SHARE_QUOTE_ALERT_CANNOT,
  SHARE_QUOTE_ALERT_FAILED,
  SHARE_QUOTE_EMPTY,
  SHARE_QUOTE_FAILED,
  SHARE_QUOTE_LABEL,
  alertForFailedShare,
  hasCustomerFacingLines,
} from '../../../src/quotes/share-customer-quote';
import { shareCustomerQuoteAndMarkSent } from '../../../src/quotes/share-and-mark-sent';
import { findQuoteRecord } from '../../../src/quotes/find-quote';
import { colors, spacing, typography } from '../../../src/theme/tokens';

export default function QuoteDetailScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const contractor = useAuthStore((s) => s.contractor);

  const [quote, setQuote] = useState<QuoteDetailSnapshot | null>(null);
  const [lineItems, setLineItems] = useState<QuoteLineItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);

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
        persistRemoteQuote: async (remoteQuote) => {
          try {
            const q = await database.get<Quote>('quotes').find(id);
            await database.write(async () => {
              await q.update((record) => {
                record.privateNote = normalizePrivateNote(remoteQuote.privateNote);
                record.clientSentence = remoteQuote.clientSentence ?? null;
                record.roomsJson = serializeRooms(remoteQuote.rooms ?? []);
                record.photosJson = serializePhotos(
                  mergePhotosOnHydrate(
                    parsePhotosJson(q.photosJson),
                    remoteQuote.photos ?? [],
                  ),
                );
              });
            });
          } catch {
            // Local persist is best-effort; the in-memory snapshot still shows.
          }
        },
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

  async function handleSharePress(): Promise<void> {
    if (!quote || sharing) return;
    if (!hasCustomerFacingLines(lineItems)) {
      Alert.alert(SHARE_QUOTE_ALERT_CANNOT, SHARE_QUOTE_EMPTY);
      return;
    }
    setSharing(true);
    try {
      const found = await findQuoteRecord(() =>
        database.get<Quote>('quotes').find(id),
      );
      const { share, marked } = await shareCustomerQuoteAndMarkSent(
        {
          customerPhone: quote.customerPhone,
          totalCents: quote.totalCents,
          clientSentence: quote.clientSentence,
          privateNote: quote.privateNote,
          rooms: quote.rooms,
          photos: quote.photos,
          lineItems,
        },
        found.ok ? found.record : null,
        {
          displayName: contractor?.displayName,
          trade: contractor?.trade,
        },
      );
      if (!share.ok) {
        const alert = alertForFailedShare(share);
        Alert.alert(alert.title, alert.message);
        return;
      }
      if (marked === 'sent' && found.ok) {
        setQuote((prev) =>
          prev
            ? {
                ...prev,
                status: found.record.status,
                sentAt: found.record.sentAt?.toISOString() ?? prev.sentAt,
              }
            : prev,
        );
      }
    } catch {
      Alert.alert(SHARE_QUOTE_ALERT_FAILED, SHARE_QUOTE_FAILED);
    } finally {
      setSharing(false);
    }
  }

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
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      <QuoteDetail
        quote={{
          status: quote.status,
          customerPhone: quote.customerPhone,
          totalCents: quote.totalCents,
          createdAt: quote.createdAt,
          sentAt: quote.sentAt,
          privateNote: quote.privateNote,
          clientSentence: quote.clientSentence,
          rooms: quote.rooms,
          photos: quote.photos,
        }}
        lineItems={lineItems}
      />
      <Pressable
        style={[styles.shareButton, sharing && styles.shareButtonBusy]}
        onPress={() => { void handleSharePress(); }}
        accessibilityRole="button"
        accessibilityLabel={SHARE_QUOTE_LABEL}
        accessibilityState={{ disabled: sharing }}
      >
        <Text style={styles.shareButtonText}>{SHARE_QUOTE_LABEL}</Text>
      </Pressable>
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
  shareButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.dominant,
  },
  shareButtonBusy: {
    opacity: 0.6,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
  },
});
