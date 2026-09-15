import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { RateCardEntryResponse } from '../../src/api/rate-card';
import { listRateCardEntries } from '../../src/api/rate-card';
import { EditRatePriceSheet } from '../../src/components/rate-card/edit-price-sheet';
import { RateRow } from '../../src/components/rate-card/rate-row';
import { RatesEmptyState } from '../../src/components/rate-card/rates-empty-state';
import { RatesLoadError } from '../../src/components/rate-card/rates-load-error';
import { RatesSearchField } from '../../src/components/rate-card/rates-search-field';
import { buildRateCardEditPayload, rateCardEditQueueEntityId } from '../../src/rate-card/edit-payload';
import {
  DELETE_RATE_CONFIRM_ACTION,
  DELETE_RATE_CONFIRM_MESSAGE,
  DELETE_RATE_CONFIRM_TITLE,
  MY_RATES_INTRO,
  MY_RATES_NO_MATCHES,
  MY_RATES_SAVE_ERROR,
} from '../../src/rate-card/list-copy';
import {
  nextRateCardListOffset,
  RATE_CARD_LIST_PAGE_SIZE,
  rateCardListSearchParam,
} from '../../src/rate-card/list-query';
import { enqueue } from '../../src/sync/sync-queue';
import { colors, spacing, typography } from '../../src/theme/tokens';

const SEARCH_DEBOUNCE_MS = 300;

export default function MyRatesScreen(): JSX.Element {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [entries, setEntries] = useState<RateCardEntryResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<RateCardEntryResponse | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => {
      setAppliedQuery(rateCardListSearchParam(searchText) ?? '');
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchText]);

  const loadPage = useCallback(
    async (offset: number): Promise<void> => {
      const appending = offset > 0;
      const seq = appending ? requestSeq.current : ++requestSeq.current;
      if (appending) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(false);
      }
      try {
        const page = await listRateCardEntries({
          limit: RATE_CARD_LIST_PAGE_SIZE,
          offset,
          q: appliedQuery || undefined,
        });
        if (seq !== requestSeq.current) {
          return;
        }
        setTotal(page.total);
        setEntries((current) => (appending ? [...current, ...page.entries] : page.entries));
      } catch {
        if (seq !== requestSeq.current) {
          return;
        }
        if (!appending) {
          setError(true);
          setEntries([]);
          setTotal(0);
        }
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [appliedQuery],
  );

  useFocusEffect(
    useCallback(() => {
      void loadPage(0);
    }, [loadPage]),
  );

  function applySearchNow(): void {
    setAppliedQuery(rateCardListSearchParam(searchText) ?? '');
  }

  function openImport(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push('/import-quotes' as any);
  }

  function handleEndReached(): void {
    if (loading || loadingMore || error) return;
    const next = nextRateCardListOffset(entries.length, total);
    if (next == null) return;
    void loadPage(next);
  }

  async function handleSave(unitPriceCents: number): Promise<void> {
    if (!editing) return;
    const payload = buildRateCardEditPayload(editing, unitPriceCents);
    if (!payload) {
      return;
    }
    try {
      await enqueue({
        entityType: 'rate_card',
        entityId: rateCardEditQueueEntityId(editing),
        action: 'update',
        payload,
      });
      setEntries((current) =>
        current.map((row) =>
          row.id === editing.id
            ? { ...row, unitPriceCents, source: 'typed' }
            : row,
        ),
      );
      setSheetVisible(false);
      setEditing(null);
    } catch {
      Alert.alert('Could not save', MY_RATES_SAVE_ERROR);
    }
  }

  function handleDelete(entry: RateCardEntryResponse): void {
    Alert.alert(DELETE_RATE_CONFIRM_TITLE, DELETE_RATE_CONFIRM_MESSAGE, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: DELETE_RATE_CONFIRM_ACTION,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await enqueue({
                entityType: 'rate_card',
                entityId: entry.id,
                action: 'delete',
                payload: { id: entry.id, name: entry.displayName },
              });
              setEntries((current) => current.filter((row) => row.id !== entry.id));
              setTotal((current) => Math.max(0, current - 1));
            } catch {
              Alert.alert('Could not remove', MY_RATES_SAVE_ERROR);
            }
          })();
        },
      },
    ]);
  }

  const hasQuery = appliedQuery.length > 0;
  const showNoRatesEmpty = !loading && !error && entries.length === 0 && !hasQuery;
  const showNoMatches = !loading && !error && entries.length === 0 && hasQuery;

  return (
    <SafeAreaView style={styles.container}>
      {error ? (
        <RatesLoadError
          onRetry={() => {
            void loadPage(0);
          }}
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <RateRow
              entry={item}
              onPress={() => {
                setEditing(item);
                setSheetVisible(true);
              }}
              onDelete={() => handleDelete(item)}
            />
          )}
          ListHeaderComponent={
            <View>
              <RatesSearchField
                value={searchText}
                onChangeText={setSearchText}
                onSubmit={applySearchNow}
              />
              {showNoRatesEmpty ? null : (
                <Text style={styles.intro}>{MY_RATES_INTRO}</Text>
              )}
            </View>
          }
          ListEmptyComponent={
            showNoRatesEmpty ? (
              <RatesEmptyState onImportOldQuotes={openImport} />
            ) : showNoMatches ? (
              <Text style={styles.noMatches}>{MY_RATES_NO_MATCHES}</Text>
            ) : null
          }
          ListFooterComponent={
            !showNoRatesEmpty && !loading && entries.length > 0 ? (
              <Pressable
                onPress={openImport}
                accessibilityRole="button"
                accessibilityLabel="Import old quotes"
                style={styles.importLink}
              >
                <Text style={styles.importLinkText}>Import old quotes</Text>
              </Pressable>
            ) : null
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          contentContainerStyle={showNoRatesEmpty ? styles.emptyContent : undefined}
        />
      )}
      <EditRatePriceSheet
        visible={sheetVisible}
        entry={editing}
        onSave={(cents) => {
          void handleSave(cents);
        }}
        onClose={() => {
          setSheetVisible(false);
          setEditing(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dominant,
  },
  emptyContent: {
    flexGrow: 1,
  },
  intro: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  noMatches: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    textAlign: 'center',
  },
  importLink: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  importLinkText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
});
