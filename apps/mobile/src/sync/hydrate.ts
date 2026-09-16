import { Q } from '@nozbe/watermelondb';
import { fetchCatalogItems, type CatalogItemResponse } from '../api/catalog';
import { parseCatalogUnit } from '../catalog/units';
import {
  isCatalogUnarchiveQueueItem,
  shouldArchiveLocalCatalogItemOnHydrate,
} from '../catalog/archive-item';
import { fetchQuotes, type QuoteListItem } from '../api/quotes';
import { database } from '../db';
import type { CatalogItem } from '../db/models/catalog-item';
import type { Draft } from '../db/models/draft';
import type { Quote } from '../db/models/quote';
import type { SyncQueueItem } from '../db/models/sync-queue-item';
import { parseLineItems, serializeLineItems } from '../utils/line-items';
import { applyServerQuoteInWrite } from './apply-server-quote';
import {
  comparableLineItems,
  shouldApplyHydrateDraftConflict,
} from './draft-conflict';
import {
  dropPendingQuoteDraftUpdatesInWrite,
  ensureNeedsReviewInWrite,
} from './draft-conflict-queue';
import { isFrozenQuoteStatus } from './frozen-quote';
import { toDraftLineItems } from './draft-line-items';
import { rememberServerRevision } from './server-revision';
import { createSingleFlight } from './single-flight';
import { serializeRooms, type QuoteRoom } from '../quotes/rooms';
import { normalizePrivateNote } from '../quotes/private-notes';
import { mergePhotosOnHydrate, mergeStoredPhotosWithServer, serializePhotos, type ServerQuotePhoto } from '../quotes/photos';
import {
  hydrateArchivedFlag,
  isQuoteUnarchiveQueueItem,
  mergeQuoteHydrateLists,
  shouldArchiveLocalQuoteOnHydrate,
} from '../quotes/archive-quote';
import { isDeadLetterAudioUpload } from '../quotes/voice-upload-queue';

export { toDraftLineItems } from './draft-line-items';

const hydrateFlight = createSingleFlight();

const BLOCKING_QUEUE_STATUSES = new Set(['pending', 'failed', 'in_progress']);

function isBlockingStatus(status: string): boolean {
  return BLOCKING_QUEUE_STATUSES.has(status);
}

function parseMs(iso: string): Date {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/**
 * Server-as-truth when the pull has a category. A null server value must not
 * overwrite a local tradeCategory (A-15: create used to persist NULL).
 */
export function mergeHydratedTradeCategory(
  local: string | null | undefined,
  server: string | null,
): string | null {
  if (typeof server === 'string' && server.trim() !== '') {
    return server;
  }
  if (typeof local === 'string' && local.trim() !== '') {
    return local;
  }
  return server ?? local ?? null;
}

function catalogLocalIdByServerId(items: CatalogItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.serverId) {
      map.set(item.serverId, item.id);
    }
  }
  return map;
}

export async function upsertCatalogItems(
  contractorId: string,
  items: CatalogItemResponse[],
): Promise<void> {
  const collection = database.get<CatalogItem>('catalog_items');
  const queueItems = await database.get<SyncQueueItem>('sync_queue_items').query().fetch();
  const blockedIds = new Set(
    queueItems
      .filter((item) => item.entityType === 'catalog_item' && isBlockingStatus(item.status))
      .map((item) => item.entityId),
  );
  const unarchiveHeldIds = new Set(
    queueItems.filter(isCatalogUnarchiveQueueItem).map((item) => item.entityId),
  );

  await database.write(async () => {
    const existing = await collection.query(Q.where('contractor_id', contractorId)).fetch();
    const byServerId = new Map<string, CatalogItem>();
    const unmatchedByName = new Map<string, CatalogItem[]>();
    for (const row of existing) {
      if (row.serverId) {
        byServerId.set(row.serverId, row);
      } else {
        const list = unmatchedByName.get(row.name) ?? [];
        list.push(row);
        unmatchedByName.set(row.name, list);
      }
    }

    for (const item of items) {
      const local = byServerId.get(item.id);
      if (local) {
        if (blockedIds.has(local.id)) {
          continue;
        }
        await local.update((record) => {
          record.name = item.name;
          record.unit = parseCatalogUnit(item.unit) ?? item.unit;
          record.unitPriceCents = item.unitPriceCents;
          record.tradeCategory = mergeHydratedTradeCategory(
            record.tradeCategory,
            item.tradeCategory,
          );
          record.isArchived = item.isArchived;
          record.updatedAt = parseMs(item.updatedAt);
        });
        continue;
      }

      // A-03: local-only offline seed rows share names with a later server seed.
      // Adopt them instead of inserting a second local copy. Leave unmatched
      // local-only rows (custom SKUs) alone.
      const nameMatches = unmatchedByName.get(item.name);
      const nameMatch = nameMatches?.shift();
      if (nameMatch) {
        if (blockedIds.has(nameMatch.id)) {
          // Queued write owns fields; still attach the server id so a later
          // catalog update/create can push without POSTing a duplicate.
          await nameMatch.update((record) => {
            record.serverId = item.id;
          });
        } else {
          await nameMatch.update((record) => {
            record.serverId = item.id;
            record.name = item.name;
            record.unit = parseCatalogUnit(item.unit) ?? item.unit;
            record.unitPriceCents = item.unitPriceCents;
            record.tradeCategory = mergeHydratedTradeCategory(
              record.tradeCategory,
              item.tradeCategory,
            );
            record.isArchived = item.isArchived;
            record.updatedAt = parseMs(item.updatedAt);
          });
        }
        byServerId.set(item.id, nameMatch);
        continue;
      }

      await collection.create((record) => {
        record.serverId = item.id;
        record.contractorId = contractorId;
        record.name = item.name;
        record.unit = parseCatalogUnit(item.unit) ?? item.unit;
        record.unitPriceCents = item.unitPriceCents;
        record.tradeCategory = mergeHydratedTradeCategory(null, item.tradeCategory);
        record.isArchived = item.isArchived;
        record.createdAt = parseMs(item.createdAt);
        record.updatedAt = parseMs(item.updatedAt);
      });
    }

    const pulledServerIds = new Set(items.map((item) => item.id));
    for (const local of existing) {
      if (
        shouldArchiveLocalCatalogItemOnHydrate({
          serverId: local.serverId,
          isArchived: local.isArchived === true,
          blocked: blockedIds.has(local.id) || unarchiveHeldIds.has(local.id),
          pulledServerIds,
        })
      ) {
        await local.update((record) => {
          record.isArchived = true;
        });
      }
    }
  });
}

export async function upsertQuotes(
  contractorId: string,
  quotes: QuoteListItem[],
): Promise<void> {
  const quoteCollection = database.get<Quote>('quotes');
  const draftCollection = database.get<Draft>('drafts');
  const catalogCollection = database.get<CatalogItem>('catalog_items');
  const queueItems = await database.get<SyncQueueItem>('sync_queue_items').query().fetch();
  const blockedQuoteIds = new Set<string>();
  const blockedDraftIds = new Set<string>();
  const unarchiveHeldIds = new Set<string>();
  for (const item of queueItems) {
    if (isBlockingStatus(item.status)) {
      if (item.entityType === 'quote') {
        blockedQuoteIds.add(item.entityId);
      }
      if (item.entityType === 'draft') {
        blockedDraftIds.add(item.entityId);
      }
    }
    if (isQuoteUnarchiveQueueItem(item)) {
      unarchiveHeldIds.add(item.entityId);
    }
    if (isDeadLetterAudioUpload(item)) {
      blockedQuoteIds.add(item.entityId);
    }
  }

  await database.write(async () => {
    const existingQuotes = await quoteCollection
      .query(Q.where('contractor_id', contractorId))
      .fetch();
    const quoteByServerId = new Map<string, Quote>();
    for (const row of existingQuotes) {
      if (row.serverId) {
        quoteByServerId.set(row.serverId, row);
      }
    }

    const catalogRows = await catalogCollection
      .query(Q.where('contractor_id', contractorId))
      .fetch();
    const localCatalogIds = catalogLocalIdByServerId(catalogRows);

    const existingDrafts = await draftCollection.query().fetch();
    const draftByQuoteId = new Map<string, Draft>();
    for (const draft of existingDrafts) {
      if (!draftByQuoteId.has(draft.quoteId)) {
        draftByQuoteId.set(draft.quoteId, draft);
      }
    }

    const pulledServerIds = new Set(quotes.map((quote) => quote.id));

    for (const quote of quotes) {
      rememberServerRevision(quote.id, quote.updatedAt);

      let local = quoteByServerId.get(quote.id);
      if (!local) {
        local = await quoteCollection.create((record) => {
          record.serverId = quote.id;
          record.contractorId = contractorId;
          record.status = quote.status;
          record.customerPhone = quote.customerPhone;
          record.totalCents = quote.totalCents;
          record.createdAt = parseMs(quote.createdAt);
          record.updatedAt = parseMs(quote.updatedAt);
          record.sentAt = quote.sentAt ? parseMs(quote.sentAt) : null;
          record.voiceJobId = quote.voiceJobId;
          record.isArchived = quote.isArchived === true;
          record.privateNote = normalizePrivateNote(quote.privateNote);
          record.clientSentence = quote.clientSentence ?? null;
          record.roomsJson = serializeRooms((quote.rooms ?? []) as QuoteRoom[]);
          record.photosJson = serializePhotos(
            mergePhotosOnHydrate([], (quote.photos ?? []) as ServerQuotePhoto[]),
          );
        });
        quoteByServerId.set(quote.id, local);
      }
      const localQuote = local;

      const serverLineItems = toDraftLineItems(quote.lineItems ?? [], localCatalogIds);
      const lineItemsJson = serializeLineItems(serverLineItems);
      const draft = draftByQuoteId.get(localQuote.id);
      const dirty =
        blockedQuoteIds.has(localQuote.id)
        || (draft != null && blockedDraftIds.has(draft.id));
      const forked =
        draft != null
        && shouldApplyHydrateDraftConflict({
          dirty,
          serverStatus: quote.status,
          localLines: comparableLineItems(parseLineItems(draft.lineItemsJson)),
          serverLines: comparableLineItems(serverLineItems),
        });

      if (forked && draft) {
        // SYNC-05: server-as-truth, then park Review-before-sending (do not leave the PUT in the queue).
        await applyServerQuoteInWrite(localQuote, draft, quote, lineItemsJson);
        await dropPendingQuoteDraftUpdatesInWrite(localQuote.id, draft.id);
        await ensureNeedsReviewInWrite(draft.id);
        continue;
      }

      const frozen = isFrozenQuoteStatus(quote.status);

      if (!blockedQuoteIds.has(localQuote.id) || frozen) {
        await localQuote.update((record) => {
          record.status = quote.status;
          record.customerPhone = quote.customerPhone;
          record.totalCents = quote.totalCents;
          record.sentAt = quote.sentAt ? parseMs(quote.sentAt) : null;
          record.voiceJobId = quote.voiceJobId;
          record.privateNote = normalizePrivateNote(quote.privateNote);
          record.clientSentence = quote.clientSentence ?? null;
          record.roomsJson = serializeRooms((quote.rooms ?? []) as QuoteRoom[]);
          record.photosJson = serializePhotos(
            mergeStoredPhotosWithServer(
              record.photosJson,
              (quote.photos ?? []) as ServerQuotePhoto[],
            ),
          );
          const serverArchived = quote.isArchived === true;
          const nextArchived = unarchiveHeldIds.has(localQuote.id)
            ? false
            : hydrateArchivedFlag({
                localIsArchived: record.isArchived === true,
                serverIsArchived: serverArchived,
                localUpdatedAt: record.updatedAt,
                serverUpdatedAt: quote.updatedAt,
              });
          record.isArchived = nextArchived;
          // Keep the newer local timestamp when we refuse a stale archive flag.
          if (nextArchived === serverArchived) {
            record.updatedAt = parseMs(quote.updatedAt);
          }
        });
      }
      if (draft) {
        if (!blockedDraftIds.has(draft.id) || frozen) {
          await draft.update((record) => {
            record.lineItemsJson = lineItemsJson;
            record.updatedAt = parseMs(quote.updatedAt);
          });
        }
      } else {
        const created = await draftCollection.create((record) => {
          record.quoteId = localQuote.id;
          record.lineItemsJson = lineItemsJson;
          record.updatedAt = parseMs(quote.updatedAt);
        });
        draftByQuoteId.set(localQuote.id, created);
      }
    }

    for (const local of existingQuotes) {
      if (
        shouldArchiveLocalQuoteOnHydrate({
          serverId: local.serverId,
          isArchived: local.isArchived === true,
          blocked: blockedQuoteIds.has(local.id) || unarchiveHeldIds.has(local.id),
          pulledServerIds,
        })
      ) {
        await local.update((record) => {
          record.isArchived = true;
        });
      }
    }
  });
}

async function hydrateOnce(contractorId: string): Promise<void> {
  const [catalogItems, activeQuotes, archivedQuotes] = await Promise.all([
    fetchCatalogItems(),
    fetchQuotes(),
    fetchQuotes({ archived: true }),
  ]);
  await upsertCatalogItems(contractorId, catalogItems);
  await upsertQuotes(contractorId, mergeQuoteHydrateLists(activeQuotes, archivedQuotes));
}

/**
 * Pull the contractor's server catalog and quotes into WatermelonDB.
 * Idempotent: rows are keyed by server_id and re-running does not duplicate.
 * Local-only rows (server_id null) are left alone unless a pulled item shares
 * a name — then the local row is adopted (A-03 offline seed de-dupe).
 * Catalog and unblocked quotes are server-as-truth. GET /catalog is actives
 * only: server-backed SKUs missing from that list are soft-archived locally
 * so an archived-only catalog does not show phantom actives. A queued catalog
 * Unarchive (including dead_letter) is not overwritten. A dirty pre-send draft whose
 * line items disagree with the server is applied from the server and parked as
 * `needs_review` (SYNC-05) instead of a silent queue overwrite. Frozen post-send
 * quotes (SYNC-06) always take the server snapshot, even if a draft PUT is queued.
 * Hydrate pulls
 * active GET /quotes and GET /quotes?archived=true so Archived can restore after
 * login. Server-backed quotes missing from both lists are soft-archived locally.
 * A queued Unarchive (including dead_letter) and a newer local archive flag are
 * not overwritten. Failures propagate.
 */
export async function hydrateFromServer(contractorId: string): Promise<void> {
  return hydrateFlight.run(() => hydrateOnce(contractorId));
}

export function resetHydrateForTests(): void {
  hydrateFlight.reset();
}
