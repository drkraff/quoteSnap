import { useState, useEffect, useCallback } from 'react';
import {
  View,
  SectionList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../src/db';
import { CatalogItem } from '../../src/db/models/catalog-item';
import { getPendingCount } from '../../src/sync/sync-queue';
import { CatalogRow } from '../../src/components/catalog/catalog-row';
import { SectionHeader } from '../../src/components/catalog/section-header';
import { EmptyState } from '../../src/components/catalog/empty-state';
import { Fab } from '../../src/components/catalog/fab';
import { colors } from '../../src/theme/tokens';

interface CatalogSection {
  title: string;
  data: CatalogItem[];
}

function groupByCategory(items: CatalogItem[]): CatalogSection[] {
  const map = new Map<string, CatalogItem[]>();

  for (const item of items) {
    const key = item.tradeCategory ?? 'Other';
    const existing = map.get(key);
    if (existing) {
      existing.push(item);
    } else {
      map.set(key, [item]);
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, data]) => ({ title, data }));
}

export default function CatalogScreen(): JSX.Element {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const collection = database.get<CatalogItem>('catalog_items');
    const query = collection.query(
      Q.where('is_archived', false),
      Q.sortBy('name', 'asc'),
    );

    const subscription = query.observe().subscribe((results) => {
      setItems(results);
      setSections(groupByCategory(results));
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // Silent — sync count is non-critical
    }
  }, []);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  function handleFabPress(): void {
    setEditingItem(null);
    setSheetVisible(true);
  }

  function handleRowPress(item: CatalogItem): void {
    setEditingItem(item);
    setSheetVisible(true);
  }

  // Archive stub — wired in Task 2
  function handleArchive(_item: CatalogItem): void {
    // Implementation added in Task 2
  }

  return (
    <SafeAreaView style={styles.container}>
      {pendingCount > 0 && (
        <View
          style={styles.syncDot}
          accessibilityLabel="Catalog has unsynced changes"
        />
      )}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <SectionHeader title={section.title} />
        )}
        renderItem={({ item }) => (
          <CatalogRow
            item={item}
            onPress={() => handleRowPress(item)}
            onArchive={() => handleArchive(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState onAddItem={handleFabPress} />
        }
        stickySectionHeadersEnabled={true}
        contentContainerStyle={items.length === 0 ? styles.emptyContent : undefined}
      />
      <Fab onPress={handleFabPress} />
      {/* ItemFormSheet and UndoToast wired in Task 2 */}
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
  syncDot: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warning,
    zIndex: 10,
  },
});
