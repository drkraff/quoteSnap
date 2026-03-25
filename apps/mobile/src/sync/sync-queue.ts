import { database } from '../db';
import { SyncQueueItem } from '../db/models/sync-queue-item';
import { isOnline, onConnectivityChange } from './network-monitor';
import { Q } from '@nozbe/watermelondb';

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

      // TODO: Actual API call — placeholder for Phase 7 sync hardening
      // await pushToServer(item);

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
