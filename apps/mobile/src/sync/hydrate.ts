import { Q } from '@nozbe/watermelondb';
import { fetchCatalogItems, type CatalogItemResponse } from '../api/catalog';
import { parseCatalogUnit } from '../catalog/units';
import { fetchQuotes, type QuoteLineItemResponse, type QuoteListItem } from '../api/quotes';
import { database } from '../db';
import type { CatalogItem } from '../db/models/catalog-item';
import type { Draft } from '../db/models/draft';
import type { Quote } from '../db/models/quote';
import type { SyncQueueItem } from '../db/models/sync-queue-item';
import { serializeLineItems, type LineItem } from '../utils/line-items';
import { createSingleFlight } from './single-flight';

const hydrateFlight = createSingleFlight();

const BLOCKING_QUEUE_STATUSES = new Set(['pending', 'failed', 'in_progress']);

function isBlockingStatus(status: string): boolean {
  return BLOCKING_QUEUE_STATUSES.has(status);
}

function parseMs(iso: string): Date {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date() : date;
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

export function toDraftLineItems(
  lineItems: QuoteLineItemResponse[],
  localIdByServerCatalogId: Map<string, string>,
): LineItem[] {
  return lineItems.map((item) => {
    const serverCatalogId = item.catalogItemId ?? '';
    const localCatalogId = serverCatalogId
      ? (localIdByServerCatalogId.get(serverCatalogId) ?? serverCatalogId)
      : '';
    const line: LineItem = {
      catalogItemId: localCatalogId,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    };
    if (item.confidence != null) {
      line.confidence = item.confidence;
    }
    return line;
  });
}

async function blockingEntityIds(entityType: string): Promise<Set<string>> {
  const items = await database.get<SyncQueueItem>('sync_queue_items').query().fetch();
  return new Set(
    items
      .filter((item) => item.entityType === entityType && isBlockingStatus(item.status))
      .map((item) => item.entityId),
  );
}

export async function upsertCatalogItems(
  contractorId: string,
  items: CatalogItemResponse[],
): Promise<void> {
  const collection = database.get<CatalogItem>('catalog_items');
  const blockedIds = await blockingEntityIds('catalog_item');

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
          record.tradeCategory = item.tradeCategory;
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
            record.tradeCategory = item.tradeCategory;
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
        record.tradeCategory = item.tradeCategory;
        record.isArchived = item.isArchived;
        record.createdAt = parseMs(item.createdAt);
        record.updatedAt = parseMs(item.updatedAt);
      });
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
  const blockedQuoteIds = await blockingEntityIds('quote');
  const blockedDraftIds = await blockingEntityIds('draft');

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

    for (const quote of quotes) {
      let local = quoteByServerId.get(quote.id);
      if (local) {
        if (!blockedQuoteIds.has(local.id)) {
          await local.update((record) => {
            record.status = quote.status;
            record.customerPhone = quote.customerPhone;
            record.totalCents = quote.totalCents;
            record.updatedAt = parseMs(quote.updatedAt);
            record.sentAt = quote.sentAt ? parseMs(quote.sentAt) : null;
            record.voiceJobId = quote.voiceJobId;
          });
        }
      } else {
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
        });
        quoteByServerId.set(quote.id, local);
      }
      const localQuote = local;

      const lineItemsJson = serializeLineItems(
        toDraftLineItems(quote.lineItems ?? [], localCatalogIds),
      );
      const draft = draftByQuoteId.get(localQuote.id);
      if (draft) {
        if (!blockedDraftIds.has(draft.id)) {
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
  });
}

async function hydrateOnce(contractorId: string): Promise<void> {
  const [catalogItems, quotes] = await Promise.all([fetchCatalogItems(), fetchQuotes()]);
  await upsertCatalogItems(contractorId, catalogItems);
  await upsertQuotes(contractorId, quotes);
}

/**
 * Pull the contractor's server catalog and quotes into WatermelonDB.
 * Idempotent: rows are keyed by server_id and re-running does not duplicate.
 * Local-only rows (server_id null) are left alone unless a pulled item shares
 * a name — then the local row is adopted (A-03 offline seed de-dupe).
 * Does not touch the write queue. Failures propagate to the caller.
 */
export async function hydrateFromServer(contractorId: string): Promise<void> {
  return hydrateFlight.run(() => hydrateOnce(contractorId));
}

export function resetHydrateForTests(): void {
  hydrateFlight.reset();
}
