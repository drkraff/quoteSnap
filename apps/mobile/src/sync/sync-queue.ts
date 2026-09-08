import { database } from '../db';
import { SyncQueueItem } from '../db/models/sync-queue-item';
import { isOnline, onConnectivityChange } from './network-monitor';
import { Q } from '@nozbe/watermelondb';
import { parseCatalogUnit } from '../catalog/units';
import { createCatalogItem, updateCatalogItem, archiveCatalogItem } from '../api/catalog';
import { uploadAudio } from '../api/voice';
import type { Trade } from '../api/onboarding';
import { CatalogItem } from '../db/models/catalog-item';
import { createQuoteOnServer, updateQuoteOnServer } from '../api/quotes';
import { Quote } from '../db/models/quote';
import { Draft } from '../db/models/draft';
import { applyFailureSchedule, isQueueItemDue, soonestFutureRetryMs } from './sync-retry';
import { createSingleFlight } from './single-flight';
import { resolveAudioQuoteServerId } from './audio-parent';
import { syncQueuedOnboardingSeed } from './offline-onboarding-seed';

const queueFlight = createSingleFlight();
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export interface SyncEnqueueParams {
  entityType: 'quote' | 'catalog_item' | 'draft' | 'audio' | 'onboarding';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'seed';
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
      item.nextRetryAt = null;
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

  if (item.entityType === 'onboarding' && item.action === 'seed') {
    await syncQueuedOnboardingSeed(item.entityId, payload.trade as Trade);
    return;
  }

  if (item.entityType === 'catalog_item') {
    if (item.action === 'create') {
      const catalogCollection = database.get<CatalogItem>('catalog_items');
      const localItems = await catalogCollection
        .query(Q.where('id', item.entityId))
        .fetch();
      // Seed/hydrate may have already mapped this local-only row (A-03 de-dupe).
      if (localItems[0]?.serverId) {
        return;
      }
      const response = await createCatalogItem({
        name: payload.name as string,
        unit: parseCatalogUnit(payload.unit) ?? (payload.unit as string),
        unitPriceCents: payload.unitPriceCents as number,
        tradeCategory: payload.tradeCategory as string | undefined,
      });
      // Update local record with server ID
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
          unit:
            payload.unit === undefined
              ? undefined
              : (parseCatalogUnit(payload.unit) ?? (payload.unit as string)),
          unitPriceCents: payload.unitPriceCents as number | undefined,
        });
      }
    }
    return;
  }

  if (item.entityType === 'quote') {
    if (item.action === 'create') {
      const response = await createQuoteOnServer({
        status: payload.status as string | undefined,
        customerPhone: payload.customerPhone as string | undefined,
        totalCents: payload.totalCents as number | undefined,
      });
      const quoteCollection = database.get<Quote>('quotes');
      const localItems = await quoteCollection.query(Q.where('id', item.entityId)).fetch();
      if (localItems[0]) {
        await database.write(async () => {
          await localItems[0].update((r) => {
            r.serverId = response.id;
          });
        });
      }
    } else if (item.action === 'update') {
      const quoteCollection = database.get<Quote>('quotes');
      const localItems = await quoteCollection.query(Q.where('id', item.entityId)).fetch();
      const serverId = localItems[0]?.serverId;
      if (!serverId) throw new Error('Cannot sync update: no server ID for quote');
      await updateQuoteOnServer(serverId, {
        status: payload.status as string | undefined,
        customerPhone: payload.customerPhone as string | undefined,
        totalCents: payload.totalCents as number | undefined,
        lineItems: payload.lineItems as Array<{ name: string; quantity: number; unitPriceCents: number }> | undefined,
      });
    }
    return;
  }

  if (item.entityType === 'draft') {
    // Draft sync: look up parent quote's serverId, send line items as quote update
    const draftCollection = database.get<Draft>('drafts');
    const localDrafts = await draftCollection.query(Q.where('id', item.entityId)).fetch();
    const draft = localDrafts[0];
    if (!draft) return;
    const quoteCollection = database.get<Quote>('quotes');
    const quotes = await quoteCollection.query(Q.where('id', draft.quoteId)).fetch();
    const quote = quotes[0];
    if (!quote?.serverId) {
      throw new Error('Cannot sync draft: parent quote has no server ID yet');
    }
    const lineItemsRaw = payload.lineItemsJson as string | undefined;
    if (lineItemsRaw) {
      const items = JSON.parse(lineItemsRaw) as Array<{ name: string; quantity: number; unitPriceCents: number }>;
      await updateQuoteOnServer(quote.serverId, { lineItems: items, totalCents: payload.totalCents as number | undefined });
    }
    return;
  }

  if (item.entityType === 'audio') {
    const { filePath, quoteLocalId } = payload as { filePath: string; quoteLocalId: string };
    const quoteCollection = database.get<Quote>('quotes');
    const localQuotes = await quoteCollection.query(Q.where('id', quoteLocalId)).fetch();
    const quote = localQuotes[0];
    if (!quote) throw new Error('Cannot sync audio: quote not found');

    const quoteServerId = resolveAudioQuoteServerId(quote);
    const { jobId, quoteId: serverQuoteId } = await uploadAudio(filePath, quoteServerId);

    // Store jobId and serverId on local quote
    await database.write(async () => {
      await quote.update((r) => {
        r.voiceJobId = jobId;
        r.serverId = serverQuoteId;
      });
    });
    return;
  }

  // Other entity types — log and skip (unknown types should not crash the queue)
  // eslint-disable-next-line no-console
  console.warn(`Unhandled entity type: ${item.entityType}`);
}

function nextRetryAtMs(item: SyncQueueItem): number | null {
  return item.nextRetryAt ? item.nextRetryAt.getTime() : null;
}

function scheduleRetryTimer(atMs: number | null): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (atMs == null) return;
  const delay = Math.max(0, atMs - Date.now());
  retryTimer = setTimeout(() => {
    retryTimer = null;
    processQueue().catch(() => {});
  }, delay);
}

async function processQueueOnce(): Promise<void> {
  if (!isOnline()) return;

  const collection = database.get<SyncQueueItem>('sync_queue_items');
  const candidates = await collection
    .query(
      Q.or(
        Q.where('status', 'pending'),
        Q.where('status', 'failed'),
        Q.where('status', 'in_progress'),
      ),
      Q.sortBy('created_at', 'asc'),
    )
    .fetch();

  const now = Date.now();
  const due = candidates.filter((item) =>
    isQueueItemDue({ status: item.status, nextRetryAtMs: nextRetryAtMs(item) }, now),
  );

  for (const item of due) {
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
      const nextCount = item.retryCount + 1;
      const schedule = applyFailureSchedule(nextCount, Date.now());
      await database.write(async () => {
        await item.update((record) => {
          record.retryCount = nextCount;
          record.lastError = errorMessage;
          record.status = schedule.status;
          record.nextRetryAt = schedule.nextRetryAtMs != null ? new Date(schedule.nextRetryAtMs) : null;
        });
      });
    }
  }

  const remaining = await collection
    .query(
      Q.or(
        Q.where('status', 'pending'),
        Q.where('status', 'failed'),
      ),
    )
    .fetch();
  scheduleRetryTimer(
    soonestFutureRetryMs(
      remaining.map((item) => ({ status: item.status, nextRetryAtMs: nextRetryAtMs(item) })),
      Date.now(),
    ),
  );
}

export async function processQueue(): Promise<void> {
  if (!isOnline()) return;
  return queueFlight.run(processQueueOnce);
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

  return () => {
    unsubscribe();
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
}

export async function getPendingCount(): Promise<number> {
  const collection = database.get<SyncQueueItem>('sync_queue_items');
  return collection.query(Q.where('status', 'pending')).fetchCount();
}

export async function getDeadLetterItems(): Promise<SyncQueueItem[]> {
  const collection = database.get<SyncQueueItem>('sync_queue_items');
  return collection.query(Q.where('status', 'dead_letter')).fetch();
}

export function resetSyncQueueForTests(): void {
  queueFlight.reset();
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}
