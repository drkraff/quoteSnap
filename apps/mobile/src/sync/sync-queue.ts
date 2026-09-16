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
import { archiveQuote, createQuoteOnServer, unarchiveQuote, updateQuoteOnServer, uploadQuotePhoto } from '../api/quotes';
import { upsertRateCardEntry, deleteRateCardEntry } from '../api/rate-card';
import { Quote } from '../db/models/quote';
import { Draft } from '../db/models/draft';
import { applyFailureSchedule, isQueueItemDue, soonestFutureRetryMs } from './sync-retry';
import { createSingleFlight } from './single-flight';
import { resolveAudioQuoteServerId, quoteServerIdFromUploadError } from './audio-parent';
import { syncQueuedOnboardingProfile, syncQueuedOnboardingSeed } from './offline-onboarding-seed';
import { canRetryDeadLetter, deadLetterRetryPatch, queueFailureMessage } from './dead-letter';
import { lineItemsFromQueuePayload } from './draft-conflict';
import { fetchAndResolveDraftFork } from './draft-conflict-sync';
import { parseRoomsJson } from '../quotes/rooms';
import { normalizePrivateNote } from '../quotes/private-notes';
import { assignStoredAiFailureStage } from '../quotes/ai-failed-recovery';
import {
  failQuoteAfterAudioDeadLetterPlan,
  isDeadLetterAudioUpload,
  resumeQuoteAfterAudioDeadLetterRetryPlan,
} from '../quotes/voice-upload-queue';
import {
  parsePhotosJson,
  serializePhotos,
  shouldUploadQueuedPhoto,
  stampPhotoUploaded,
} from '../quotes/photos';
import {
  FrozenQuoteWriteError,
  QUOTE_MONEY_FROZEN_ERROR,
  isFrozenQuoteWriteError,
  isShareSentSnapshotPayload,
  payloadMutatesQuoteMoney,
  shouldParkFrozenMoneyPut,
} from './frozen-quote';
import { rememberServerRevision } from './server-revision';

const queueFlight = createSingleFlight();
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export interface SyncEnqueueParams {
  entityType: 'quote' | 'catalog_item' | 'draft' | 'audio' | 'onboarding' | 'rate_card' | 'photo';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'seed' | 'profile';
  payload: Record<string, unknown>;
}

async function quoteByLocalId(quoteId: string): Promise<Quote | undefined> {
  const quotes = await database.get<Quote>('quotes').query(Q.where('id', quoteId)).fetch();
  return quotes.find((row) => row.id === quoteId);
}

/** After SYNC-03 exhausts a voice upload, surface FAIL-04/05 — status only. */
async function failQuoteForDeadLetterAudio(item: {
  entityType: string;
  action?: string | null;
  status: string;
  entityId: string;
}): Promise<void> {
  if (!isDeadLetterAudioUpload(item)) return;
  const quote = await quoteByLocalId(item.entityId);
  if (!quote) return;
  const plan = failQuoteAfterAudioDeadLetterPlan({
    quoteId: quote.id,
    status: quote.status,
  });
  if (!plan.ok) return;
  await database.write(async () => {
    await quote.update((record) => {
      record.status = plan.nextStatus;
    });
  });
}

/** Sync issues / FAIL-04 retry: resume the quiet upload loop if still ai_failed. */
async function resumeQuoteForAudioRetry(item: {
  entityType: string;
  entityId: string;
}): Promise<void> {
  if (item.entityType !== 'audio') return;
  const quote = await quoteByLocalId(item.entityId);
  if (!quote) return;
  const plan = resumeQuoteAfterAudioDeadLetterRetryPlan({
    quoteId: quote.id,
    status: quote.status,
  });
  if (!plan.ok) return;
  await database.write(async () => {
    await quote.update((record) => {
      record.status = plan.nextStatus;
      assignStoredAiFailureStage(record, plan.nextStatus);
    });
  });
}

/**
 * Quotes that already exhausted audio retries (app upgrade / leftover rows)
 * get the same local ai_failed flip so tap is not stuck on inert Queued.
 */
export async function applyAudioDeadLetterQuoteFailures(): Promise<void> {
  const items = await getDeadLetterItems();
  for (const item of items) {
    await failQuoteForDeadLetterAudio(item);
  }
}

export async function enqueue(params: SyncEnqueueParams): Promise<void> {
  const collection = database.get<SyncQueueItem>('sync_queue_items');
  let reusedDeadLetter: SyncQueueItem | null = null;
  await database.write(async () => {
    if (params.entityType === 'audio' && params.action === 'create') {
      const candidates = await collection
        .query(
          Q.where('entity_type', 'audio'),
          Q.where('entity_id', params.entityId),
          Q.where('status', 'dead_letter'),
        )
        .fetch();
      const existing = candidates.find(
        (item) =>
          isDeadLetterAudioUpload(item) &&
          item.entityId === params.entityId &&
          item.action === 'create',
      );
      if (existing) {
        const patch = deadLetterRetryPatch();
        await existing.update((record) => {
          record.status = patch.status;
          record.retryCount = patch.retryCount;
          record.nextRetryAt = patch.nextRetryAt;
        });
        reusedDeadLetter = existing;
        return;
      }
    }
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

  if (reusedDeadLetter) {
    await resumeQuoteForAudioRetry(reusedDeadLetter);
  }

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
      // Stale in_progress / retry after POST+stamp must not insert a second quote
      // (catalog create already skips when serverId is known).
      if (localQuote.serverId) {
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
        clientSentence:
          payload.clientSentence === undefined
            ? undefined
            : (payload.clientSentence as string | null),
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
      if (
        payloadMutatesQuoteMoney(payload)
        && payloadLines
        && localQuote
        && !isShareSentSnapshotPayload(payload)
      ) {
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
      if (localQuote && shouldParkFrozenMoneyPut(localQuote.status, payload)) {
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
        clientSentence:
          payload.clientSentence === undefined
            ? undefined
            : (payload.clientSentence as string | null),
        ...(payload.rooms !== undefined
          ? {
              rooms: payload.rooms as {
                id: string;
                name: string;
                privateNote?: string | null;
              }[],
            }
          : {}),
        lineItems: payload.lineItems as {
          name: string;
          quantity: number;
          unitPriceCents: number;
          unit?: string | null;
          privateNote?: string | null;
          priceSource?: string | null;
          optionGroupId?: string | null;
          optionRole?: string | null;
          roomId?: string | null;
          clientId?: string | null;
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
        priceSource?: string | null;
        optionGroupId?: string | null;
        optionRole?: string | null;
        roomId?: string | null;
        clientId?: string | null;
      }[];
      const payloadLines = lineItemsFromQueuePayload(payload) ?? [];
      const outcome = await fetchAndResolveDraftFork({
        quote,
        draft,
        localLines: payloadLines,
      });
      if (outcome === 'conflict') return;
      if (outcome === 'frozen') throw new FrozenQuoteWriteError();
      if (shouldParkFrozenMoneyPut(quote.status, payload)) {
        throw new FrozenQuoteWriteError();
      }
      const rooms = parseRoomsJson(quote.roomsJson);
      const updated = await updateQuoteOnServer(quote.serverId, {
        lineItems: items.map((line) =>
          Object.prototype.hasOwnProperty.call(line, 'privateNote')
            ? { ...line, privateNote: normalizePrivateNote(line.privateNote) }
            : line,
        ),
        totalCents: payload.totalCents as number | undefined,
        ...(quote.roomsJson != null && quote.roomsJson !== '' ? { rooms } : {}),
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

      // Store jobId and serverId on local quote. If Sync issues retried a
      // dead-lettered upload while the row was still ai_failed, resume the
      // poller — do not invent lines or prices.
      await database.write(async () => {
        await quote.update((r) => {
          r.voiceJobId = jobId;
          r.serverId = serverQuoteId;
          if (r.status === 'ai_failed') {
            r.status = 'ai_processing';
            assignStoredAiFailureStage(r, 'ai_processing');
          }
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

  if (item.entityType === 'photo') {
    const { filePath, quoteLocalId, photoId, mime } = payload as {
      filePath: string;
      quoteLocalId: string;
      photoId: string;
      mime?: string;
    };
    const quoteCollection = database.get<Quote>('quotes');
    const localQuotes = await quoteCollection.query(Q.where('id', quoteLocalId)).fetch();
    const quote = localQuotes[0];
    if (!quote) throw new Error('Cannot sync photo: quote not found');
    const quoteServerId = quote.serverId?.trim();
    if (!quoteServerId) {
      throw new Error('Cannot sync photo: parent quote has no server ID yet');
    }
    const current = parsePhotosJson(quote.photosJson);
    const photo = current.find((entry) => entry.id === photoId);
    if (!shouldUploadQueuedPhoto(current, photoId) || !photo) {
      return;
    }
    const uploaded = await uploadQuotePhoto(quoteServerId, {
      filePath,
      clientId: photoId,
      mime: photo.mime ?? mime ?? 'image/jpeg',
      roomId: photo.roomId ?? null,
      lineClientId: photo.lineClientId ?? null,
    });
    await database.write(async () => {
      await quote.update((r) => {
        r.photosJson = serializePhotos(
          stampPhotoUploaded(parsePhotosJson(r.photosJson), photoId, uploaded.photo.id),
        );
      });
    });
    return;
  }

  if (item.entityType === 'rate_card') {
    if (item.action === 'delete') {
      const id = typeof payload.id === 'string' ? payload.id : item.entityId;
      await deleteRateCardEntry(id);
      return;
    }
    const unit = parseCatalogUnit(payload.unit) ?? (payload.unit as string);
    await upsertRateCardEntry({
      name: payload.name as string,
      unit,
      unitPriceCents: payload.unitPriceCents as number,
      trade: typeof payload.trade === 'string' ? payload.trade : undefined,
      source:
        payload.source === 'confirmed'
          ? 'confirmed'
          : payload.source === 'imported'
            ? 'imported'
            : 'typed',
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
      const errorMessage = queueFailureMessage(error);
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
      if (schedule.status === 'dead_letter') {
        await failQuoteForDeadLetterAudio(item);
      }
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

  // Leftover dead-letter audio must not stay inert Queued after upgrade.
  applyAudioDeadLetterQuoteFailures().catch(() => {});

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

/**
 * SYNC-04: re-queue a dead-letter item and kick `processQueue`.
 * Only status / retry bookkeeping change — payloadJson (cents, lines) stays as stored.
 */
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
  await resumeQuoteForAudioRetry(item);
  await processQueue();
}

export function resetSyncQueueForTests(): void {
  queueFlight.reset();
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}
