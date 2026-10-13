import { useState, useEffect } from 'react';
import {
  SectionList,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Text,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { useRouter } from 'expo-router';
import { database } from '../../src/db';
import { CatalogItem } from '../../src/db/models/catalog-item';
import {
  catalogArchiveEnqueue,
  catalogUnarchiveEnqueue,
  groupCatalogByCategory,
  type CatalogSection,
} from '../../src/catalog/archive-item';
import { catalogCreateSyncPayload } from '../../src/catalog/create-sync-payload';
import { enqueue } from '../../src/sync/sync-queue';
import { useAuthStore } from '../../src/store/auth-store';
import { CatalogRow } from '../../src/components/catalog/catalog-row';
import { SectionHeader } from '../../src/components/catalog/section-header';
import { EmptyState } from '../../src/components/catalog/empty-state';
import { Fab } from '../../src/components/catalog/fab';
import { ItemFormSheet } from '../../src/components/catalog/item-form-sheet';
import { UndoToast } from '../../src/components/catalog/undo-toast';
import { SyncStatusLine } from '../../src/components/sync/sync-status-line';
import { colors } from '../../src/theme/tokens';

// Screen title: "My Catalog" — set via _layout.tsx Tabs.Screen headerTitle
export default function CatalogScreen(): JSX.Element {
  const router = useRouter();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [sections, setSections] = useState<CatalogSection<CatalogItem>[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [archivedItem, setArchivedItem] = useState<CatalogItem | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);

  useEffect(() => {
    const contractorId = useAuthStore.getState().contractor?.id ?? '';
    const collection = database.get<CatalogItem>('catalog_items');
    const query = collection.query(
      Q.where('contractor_id', contractorId),
      Q.where('is_archived', false),
      Q.sortBy('name', 'asc'),
    );

    const subscription = query.observe().subscribe((results) => {
      setItems(results);
      setSections(groupCatalogByCategory(results));
    });

    return () => subscription.unsubscribe();
  }, []);

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
          payload: catalogCreateSyncPayload(data, trade),
        });
      }
      setSheetVisible(false);
    } catch (error) {
      // TODO: surface error to user in a future plan
      // Silent catch prevents crash; data persists locally
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
      await enqueue(catalogArchiveEnqueue(item));
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
      await enqueue(catalogUnarchiveEnqueue(archivedItem));
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
          <EmptyState
            onAddItem={handleFabPress}
            onImportOldQuotes={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              router.push('/import-quotes' as any);
            }}
          />
        }
        ListHeaderComponent={
          <>
            <SyncStatusLine
              onRetry={() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                router.push('/sync-issues' as any);
              }}
            />
            <Pressable
              onPress={() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                router.push('/my-rates' as any);
              }}
              accessibilityRole="button"
              accessibilityLabel="My rates"
              style={styles.importLink}
            >
              <Text style={styles.importLinkText}>My rates</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                router.push('/import-quotes' as any);
              }}
              accessibilityRole="button"
              accessibilityLabel="Import old quotes"
              style={styles.importLink}
            >
              <Text style={styles.importLinkText}>Import old quotes</Text>
            </Pressable>
          </>
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
