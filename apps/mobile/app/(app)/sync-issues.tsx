import { useState } from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text } from 'react-native';
import { DeadLetterEmptyState } from '../../src/components/sync/dead-letter-empty-state';
import { DeadLetterRow } from '../../src/components/sync/dead-letter-row';
import {
  DEAD_LETTER_LIST_INTRO,
  toDeadLetterListItem,
} from '../../src/sync/dead-letter';
import { retryDeadLetterItem } from '../../src/sync/sync-queue';
import { useDeadLetterItems } from '../../src/sync/use-dead-letter-items';
import { colors, spacing, typography } from '../../src/theme/tokens';
import type { SyncQueueItem } from '../../src/db/models/sync-queue-item';

export default function SyncIssuesScreen(): JSX.Element {
  const items = useDeadLetterItems();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function handleRetry(item: SyncQueueItem): Promise<void> {
    if (retryingId) return;
    setRetryingId(item.id);
    try {
      await retryDeadLetterItem(item);
    } catch {
      // Item stays on the list; observe() will refresh if status changed.
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DeadLetterRow
            item={toDeadLetterListItem({
              id: item.id,
              entityType: item.entityType,
              action: item.action,
              payloadJson: item.payloadJson,
              lastError: item.lastError,
            })}
            retrying={retryingId === item.id}
            onRetry={() => {
              void handleRetry(item);
            }}
          />
        )}
        ListHeaderComponent={
          items.length > 0 ? <Text style={styles.intro}>{DEAD_LETTER_LIST_INTRO}</Text> : null
        }
        ListEmptyComponent={<DeadLetterEmptyState />}
        contentContainerStyle={items.length === 0 ? styles.emptyContent : undefined}
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
    flex: 1,
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
});
