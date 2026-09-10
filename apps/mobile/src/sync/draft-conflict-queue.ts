import { database } from '../db';
import { SyncQueueItem } from '../db/models/sync-queue-item';
import { isBlockingSyncStatus, NEEDS_REVIEW_STATUS } from './draft-conflict';

function isQuoteOrDraftUpdate(
  item: { entityType: string; action: string; status: string; entityId: string },
  quoteId: string,
  draftId: string,
): boolean {
  if (item.action !== 'update') return false;
  if (item.entityType === 'quote') return item.entityId === quoteId;
  if (item.entityType === 'draft') return item.entityId === draftId;
  return false;
}

/** Drop queued quote/draft updates so they cannot overwrite the server after we apply it. */
export async function dropPendingQuoteDraftUpdatesInWrite(
  quoteId: string,
  draftId: string,
): Promise<void> {
  const items = await database.get<SyncQueueItem>('sync_queue_items').query().fetch();
  for (const item of items) {
    if (!isQuoteOrDraftUpdate(item, quoteId, draftId)) continue;
    // Leave the in_progress row for processQueue to destroy after this handler returns.
    if (item.status === 'in_progress') continue;
    if (!isBlockingSyncStatus(item.status)) continue;
    await item.destroyPermanently();
  }
}

export async function ensureNeedsReviewInWrite(draftId: string): Promise<void> {
  const items = await database.get<SyncQueueItem>('sync_queue_items').query().fetch();
  const exists = items.some(
    (item) =>
      item.entityType === 'draft'
      && item.entityId === draftId
      && item.status === NEEDS_REVIEW_STATUS,
  );
  if (exists) return;
  const collection = database.get<SyncQueueItem>('sync_queue_items');
  await collection.create((item) => {
    item.entityType = 'draft';
    item.entityId = draftId;
    item.action = 'update';
    item.payloadJson = '{}';
    item.status = NEEDS_REVIEW_STATUS;
    item.retryCount = 0;
    item.nextRetryAt = null;
  });
}

export async function acknowledgeDraftReview(draftId: string): Promise<void> {
  const items = await database.get<SyncQueueItem>('sync_queue_items').query().fetch();
  const toDrop = items.filter(
    (item) =>
      item.entityType === 'draft'
      && item.entityId === draftId
      && item.status === NEEDS_REVIEW_STATUS,
  );
  if (toDrop.length === 0) return;
  await database.write(async () => {
    for (const item of toDrop) {
      await item.destroyPermanently();
    }
  });
}

/** Filter helper for tests and screens that observe the queue collection. */
export function isNeedsReviewForDraft(
  item: { entityType: string; entityId: string; status: string },
  draftId: string,
): boolean {
  return (
    item.entityType === 'draft'
    && item.entityId === draftId
    && item.status === NEEDS_REVIEW_STATUS
  );
}
