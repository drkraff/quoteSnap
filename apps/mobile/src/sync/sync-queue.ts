import { database } from '../db';
import { SyncQueueItem } from '../db/models/sync-queue-item';
import { isOnline, onConnectivityChange } from './network-monitor';
import { Q } from '@nozbe/watermelondb';
import { parseCatalogUnit } from '../catalog/units';
import { catalogUpdateFromQueuePayload, catalogCreateSyncPayload } from '../catalog/create-sync-payload';
import {
  archiveCatalogItem,
  createCatalogItem,
  unarchiveCatalogItem,
  updateCatalogItem,
} from '../api/catalog';
import { uploadAudio } from '../api/voice';
import type { Trade } from '../api/onboarding';
import { CatalogItem } from '../db/models/catalog-item';
import { archiveQuote, createQuoteOnServer, unarchiveQuote, updateQuoteOnServer } from '../api/quotes';
import { upsertRateCardEntry } from '../api/rate-card';
import { Quote } from '../db/models/quote';
import { Draft } from '../db/models/draft';
import { applyFailureSchedule, isQueueItemDue, soonestFutureRetryMs } from './sync-retry';
import { createSingleFlight } from './single-flight';
import { resolveAudioQuoteServerId, quoteServerIdFromUploadError } from './audio-parent';
import { syncQueuedOnboardingProfile, syncQueuedOnboardingSeed } from './offline-onboarding-seed';
import { canRetryDeadLetter, deadLetterRetryPatch } from './dead-letter';
import { lineItemsFromQueuePayload } from './draft-conflict';
import { fetchAndResolveDraftFork } from './draft-conflict-sync';
import {
  FrozenQuoteWriteError,
  QUOTE_MONEY_FROZEN_ERROR,
  isFrozenQuoteStatus,
  isFrozenQuoteWriteError,
  payloadMutatesQuoteMoney,
} from './frozen-quote';
import { rememberServerRevision } from './server-revision';

const queueFlight = createSingleFlight();
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export interface SyncEnqueueParams {
  entityType: 'quote' | 'catalog_item' | 'draft' | 'audio' | 'onboarding' | 'rate_card';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'seed' | 'profile';
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

  if (item.entityType === 'onboarding' && item.action === 'profile') {
    await syncQueuedOnboardingProfile({
      trade: payload.trade as Trade,
      hourlyRateCents: payload.hourlyRateCents as number,
      markupPercent:
        typeof payload.markupPercent === 'number' ? payload.markupPercent : null,
    });
    return;
  }

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
      const response = await createCatalogItem(
        catalogCreateSyncPayload(
          {
            name: payload.name as string,
            unit: parseCatalogUnit(payload.unit) ?? (payload.unit as string),
            unitPriceCents: payload.unitPriceCents as number,
          },
          typeof payload.tradeCategory === 'string' ? payload.tradeCategory : null,
        ),
      );
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
      // CAT-03 undo enqueues `{ isArchived: false }` — must PATCH unarchive, not PUT empty fields (A-05).
      if (payload.isArchived === true) {
        await archiveCatalogItem(serverId);
      } else if (payload.isArchived === false) {
        await unarchiveCatalogItem(serverId);
      } else {
        await updateCatalogItem(serverId, catalogUpdateFromQueuePayload(payload));
      }
    }
    return;
  }

  if (item.entityType === 'quote') {
    if (item.action === 'create') {
      const quoteCollection = database.get<Quote>('quotes');
      const localItems = await quoteCollection.query(Q.where('id', item.entityId)).fetch();
      const localQuote = localItems[0];
      // Hard-deleted never-synced local drafts must not be recreated on the server
      // (hydrate would then resurrect them).
      if (!localQuote) {
        return;
      }
      const response = await createQuoteOnServer({
        status: payload.status as string | undefined,
        customerPhone: payload.customerPhone as string | undefined,
        totalCents: payload.totalCents as number | undefined,
        privateNote:
          payload.privateNote === undefined
            ? undefined
            : (payload.privateNote as string | null),
      });
      await database.write(async () => {
        await localQuote.update((r) => {
          r.serverId = response.id;
        });
      });
      rememberServerRevision(response.id, response.updatedAt);
    } else if (item.action === 'update') {
      const quoteCollection = database.get<Quote>('quotes');
      const localItems = await quoteCollection.query(Q.where('id', item.entityId)).fetch();
      const serverId = localItems[0]?.serverId;
      if (!serverId) throw new Error('Cannot sync update: no server ID for quote');
      // Soft-archive is PATCH, not a HIST-01 status PUT (and not a hard delete).
      if (payload.isArchived === true) {
        await archiveQuote(serverId);
        return;
      }
      if (payload.isArchived === false) {
        await unarchiveQuote(serverId);
        return;
      }
      const localQuote = localItems[0];
      const payloadLines = lineItemsFromQueuePayload(payload);
      if (payloadMutatesQuoteMoney(payload) && payloadLines && localQuote) {
        const drafts = await database.get<Draft>('drafts').query(Q.where('quote_id', localQuote.id)).fetch();
        const parentDraft = drafts[0];
        if (parentDraft) {
          const outcome = await fetchAndResolveDraftFork({
            quote: localQuote,
            draft: parentDraft,
            localLines: payloadLines,
          });
          if (outcome === 'conflict') return;
          if (outcome === 'frozen') throw new FrozenQuoteWriteError();
        }
      }
      if (payloadMutatesQuoteMoney(payload) && localQuote && isFrozenQuoteStatus(localQuote.status)) {
        throw new FrozenQuoteWriteError();
      }
      const updated = await updateQuoteOnServer(serverId, {
        status: payload.status as string | undefined,
        customerPhone: payload.customerPhone as string | undefined,
        totalCents: payload.totalCents as number | undefined,
        privateNote:
          payload.privateNote === undefined
            ? undefined
            : (payload.privateNote as string | null),
        lineItems: payload.lineItems as {
          name: string;
          quantity: number;
          unitPriceCents: number;
          unit?: string | null;
          privateNote?: string | null;
        }[] | undefined,
      });
      rememberServerRevision(serverId, updated.updatedAt);
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
      const items = JSON.parse(lineItemsRaw) as {
        name: string;
        quantity: number;
        unitPriceCents: number;
        unit?: string | null;
        privateNote?: string | null;
      }[];
      const payloadLines = lineItemsFromQueuePayload(payload) ?? [];
      const outcome = await fetchAndResolveDraftFork({
        quote,
        draft,
        localLines: payloadLines,
      });
      if (outcome === 'conflict') return;
      if (outcome === 'frozen') throw new FrozenQuoteWriteError();
      if (payloadMutatesQuoteMoney(payload) && isFrozenQuoteStatus(quote.status)) {
        throw new FrozenQuoteWriteError();
      }
      const updated = await updateQuoteOnServer(quote.serverId, {
        lineItems: items as {
          name: string;
          quantity: number;
          unitPriceCents: number;
          unit?: string | null;
          privateNote?: string | null;
        }[],
        totalCents: payload.totalCents as number | undefined,
      });
      rememberServerRevision(quote.serverId, updated.updatedAt);
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
    try {
      const { jobId, quoteId: serverQuoteId } = await uploadAudio(filePath, quoteServerId);

      // Store jobId and serverId on local quote
      await database.write(async () => {
        await quote.update((r) => {
          r.voiceJobId = jobId;
          r.serverId = serverQuoteId;
        });
      });
    } catch (error) {
      const knownServerId = quoteServerIdFromUploadError(error);
      if (knownServerId && quote.serverId !== knownServerId) {
        try {
          await database.write(async () => {
            await quote.update((r) => {
              r.serverId = knownServerId;
            });
          });
        } catch (stampErr) {
          // eslint-disable-next-line no-console
          console.warn('Failed to stamp quote serverId after voice upload error:', stampErr);
        }
      }
      throw error;
    }
    return;
  }

  if (item.entityType === 'rate_card') {
    const unit = parseCatalogUnit(payload.unit) ?? (payload.unit as string);
    await upsertRateCardEntry({
      name: payload.name as string,
      unit,
      unitPriceCents: payload.unitPriceCents as number,
      trade: typeof payload.trade === 'string' ? payload.trade : undefined,
      source: payload.source === 'confirmed' ? 'confirmed' : 'typed',
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
      if (isFrozenQuoteWriteError(error)) {
        await database.write(async () => {
          await item.update((record) => {
            record.status = 'dead_letter';
            record.lastError = QUOTE_MONEY_FROZEN_ERROR;
            record.nextRetryAt = null;
          });
        });
        continue;
      }
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

export function deadLetterItemsQuery() {
  return database
    .get<SyncQueueItem>('sync_queue_items')
    .query(Q.where('status', 'dead_letter'), Q.sortBy('created_at', 'desc'));
}

export async function getDeadLetterItems(): Promise<SyncQueueItem[]> {
  return deadLetterItemsQuery().fetch();
}

/** SYNC-04: re-queue a dead-letter item and kick `processQueue`. */
export async function retryDeadLetterItem(item: SyncQueueItem): Promise<void> {
  if (!canRetryDeadLetter(item.status)) return;
  const patch = deadLetterRetryPatch();
  await database.write(async () => {
    await item.update((record) => {
      record.status = patch.status;
      record.retryCount = patch.retryCount;
      record.nextRetryAt = patch.nextRetryAt;
    });
  });
  await processQueue();
}

export function resetSyncQueueForTests(): void {
  queueFlight.reset();
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}
