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
import { enqueue, getPendingCount } from '../../src/sync/sync-queue';
import { useAuthStore } from '../../src/store/auth-store';
import { CatalogRow } from '../../src/components/catalog/catalog-row';
import { SectionHeader } from '../../src/components/catalog/section-header';
import { EmptyState } from '../../src/components/catalog/empty-state';
import { Fab } from '../../src/components/catalog/fab';
import { ItemFormSheet } from '../../src/components/catalog/item-form-sheet';
import { UndoToast } from '../../src/components/catalog/undo-toast';
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

// Screen title: "My Catalog" — set via _layout.tsx Tabs.Screen headerTitle
export default function CatalogScreen(): JSX.Element {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [archivedItem, setArchivedItem] = useState<CatalogItem | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);

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

  async function handleSave(data: {
    name: string;
    unit: string;
    unitPriceCents: number;
  }): Promise<void> {
    try {
      if (editingItem) {
        // Edit flow (CAT-02)
        await database.write(async () => {
          await editingItem.update((record) => {
            record.name = data.name;
            record.unit = data.unit;
            record.unitPriceCents = data.unitPriceCents;
          });
        });
        await enqueue({
          entityType: 'catalog_item',
          entityId: editingItem.id,
          action: 'update',
          payload: {
            name: data.name,
            unit: data.unit,
            unitPriceCents: data.unitPriceCents,
          },
        });
      } else {
        // Add flow (CAT-01)
        const contractorId =
          useAuthStore.getState().contractor?.id ?? '';
        const trade =
          useAuthStore.getState().contractor?.trade ?? null;

        const collection = database.get<CatalogItem>('catalog_items');
        const newItem = await database.write(async () => {
          return collection.create((record) => {
            record.contractorId = contractorId;
            record.name = data.name;
            record.unit = data.unit;
            record.unitPriceCents = data.unitPriceCents;
            record.tradeCategory = trade;
            record.isArchived = false;
          });
        });
        await enqueue({
          entityType: 'catalog_item',
          entityId: newItem.id,
          action: 'create',
          payload: {
            name: data.name,
            unit: data.unit,
            unitPriceCents: data.unitPriceCents,
          },
        });
      }
      setSheetVisible(false);
      void refreshPendingCount();
    } catch (error) {
      // TODO: surface error to user in a future plan
      // Silent catch prevents crash; data persists locally
      void refreshPendingCount();
    }
  }

  async function handleArchive(item: CatalogItem): Promise<void> {
    try {
      setArchivedItem(item);
      await database.write(async () => {
        await item.update((record) => {
          record.isArchived = true;
        });
      });
      setUndoVisible(true);
      await enqueue({
        entityType: 'catalog_item',
        entityId: item.id,
        action: 'update',
        payload: { isArchived: true },
      });
      void refreshPendingCount();
    } catch {
      // Revert optimistic state on failure
      setArchivedItem(null);
      setUndoVisible(false);
    }
  }

  async function handleUndo(): Promise<void> {
    if (!archivedItem) return;
    try {
      await database.write(async () => {
        await archivedItem.update((record) => {
          record.isArchived = false;
        });
      });
      await enqueue({
        entityType: 'catalog_item',
        entityId: archivedItem.id,
        action: 'update',
        payload: { isArchived: false },
      });
      void refreshPendingCount();
    } catch {
      // Undo failed — item remains archived; no crash
    } finally {
      setUndoVisible(false);
      setArchivedItem(null);
    }
  }

  function handleToastDismiss(): void {
    setUndoVisible(false);
    setArchivedItem(null);
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
            onArchive={() => { void handleArchive(item); }}
          />
        )}
        ListEmptyComponent={
          <EmptyState onAddItem={handleFabPress} />
        }
        stickySectionHeadersEnabled={true}
        contentContainerStyle={items.length === 0 ? styles.emptyContent : undefined}
      />
      <Fab onPress={handleFabPress} />
      <ItemFormSheet
        visible={sheetVisible}
        editingItem={editingItem}
        onSave={(data) => { void handleSave(data); }}
        onClose={() => setSheetVisible(false)}
      />
      <UndoToast
        visible={undoVisible}
        onUndo={() => { void handleUndo(); }}
        onDismiss={handleToastDismiss}
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
