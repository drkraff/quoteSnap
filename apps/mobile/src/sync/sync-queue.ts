import { database } from '../db';
import { SyncQueueItem } from '../db/models/sync-queue-item';
import { isOnline, onConnectivityChange } from './network-monitor';
import { Q } from '@nozbe/watermelondb';
import { createCatalogItem, updateCatalogItem, archiveCatalogItem } from '../api/catalog';
import { CatalogItem } from '../db/models/catalog-item';

export interface SyncEnqueueParams {
  entityType: 'quote' | 'catalog_item' | 'draft' | 'audio';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
}

export async function enqueue(params: SyncEnqueueParams): Promise<void> {
  const collection = database.get<SyncQueueItem>('sync_queue_items');
  await database.write(async () => {
    await collection.create((item) => {
      item.entityType = params.entityType;
      item.entityId = params.entityId;
      item.action = params.action;
      item.payloadJson = JSON.stringify(params.payload);
      item.status = 'pending';
      item.retryCount = 0;
    });
  });

  // Attempt immediate sync if online
  if (isOnline()) {
    processQueue().catch(() => {
      // Silent catch — queue will retry on next connectivity change
    });
  }
}

async function pushToServer(item: SyncQueueItem): Promise<void> {
  const payload = JSON.parse(item.payloadJson) as Record<string, unknown>;

  if (item.entityType === 'catalog_item') {
    if (item.action === 'create') {
      const response = await createCatalogItem({
        name: payload.name as string,
        unit: payload.unit as string,
        unitPriceCents: payload.unitPriceCents as number,
        tradeCategory: payload.tradeCategory as string | undefined,
      });
      // Update local record with server ID
      const catalogCollection = database.get<CatalogItem>('catalog_items');
      const localItems = await catalogCollection
        .query(Q.where('id', item.entityId))
        .fetch();
      if (localItems[0]) {
        await database.write(async () => {
          await localItems[0].update((record) => {
            record.serverId = response.id;
          });
        });
      }
    } else if (item.action === 'update') {
      const catalogCollection = database.get<CatalogItem>('catalog_items');
      const localItems = await catalogCollection
        .query(Q.where('id', item.entityId))
        .fetch();
      const serverId = localItems[0]?.serverId;
      if (!serverId) {
        throw new Error('Cannot sync update: no server ID for catalog item');
      }
      const isArchive = (payload.isArchived as boolean) === true;
      if (isArchive) {
        await archiveCatalogItem(serverId);
      } else {
        await updateCatalogItem(serverId, {
          name: payload.name as string | undefined,
          unit: payload.unit as string | undefined,
          unitPriceCents: payload.unitPriceCents as number | undefined,
        });
      }
    }
    return;
  }

  // Other entity types — still placeholder for future phases
  throw new Error(`Unhandled entity type: ${item.entityType}`);
}

export async function processQueue(): Promise<void> {
  if (!isOnline()) return;

  const collection = database.get<SyncQueueItem>('sync_queue_items');
  const pending = await collection
    .query(
      Q.where('status', 'pending'),
      Q.sortBy('created_at', 'asc'),
    )
    .fetch();

  for (const item of pending) {
    try {
      await database.write(async () => {
        await item.update((record) => {
          record.status = 'in_progress';
        });
      });

      await pushToServer(item);

      // On success, destroy the queue item
      await database.write(async () => {
        await item.destroyPermanently();
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await database.write(async () => {
        await item.update((record) => {
          record.retryCount = item.retryCount + 1;
          record.lastError = errorMessage;
          // Basic retry schedule placeholder — full schedule in Phase 7
          // 5s, 15s, 60s, 5m, 15m then dead_letter
          if (item.retryCount >= 5) {
            record.status = 'dead_letter';
          } else {
            record.status = 'failed';
          }
        });
      });
    }
  }
}

export function initSyncQueue(): () => void {
  // Process queue when connectivity changes to online
  const unsubscribe = onConnectivityChange((connected) => {
    if (connected) {
      processQueue().catch(() => {});
    }
  });

  // Initial queue processing attempt
  processQueue().catch(() => {});

  return unsubscribe;
}

export async function getPendingCount(): Promise<number> {
  const collection = database.get<SyncQueueItem>('sync_queue_items');
  return collection.query(Q.where('status', 'pending')).fetchCount();
}

export async function getDeadLetterItems(): Promise<SyncQueueItem[]> {
  const collection = database.get<SyncQueueItem>('sync_queue_items');
  return collection.query(Q.where('status', 'dead_letter')).fetch();
}
