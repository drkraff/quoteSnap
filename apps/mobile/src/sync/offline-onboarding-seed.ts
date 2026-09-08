import { Q } from '@nozbe/watermelondb';
import { fetchCatalogItems } from '../api/catalog';
import { isConflictError } from '../api/client';
import { seedCatalog, type SeedResponse, type Trade } from '../api/onboarding';
import { parseCatalogUnit } from '../catalog/units';
import { OFFLINE_TRADE_TEMPLATES } from '../data/trade-templates';
import { database } from '../db';
import { CatalogItem } from '../db/models/catalog-item';

export interface ServerCatalogRef {
  id: string;
  name: string;
}

/**
 * Stamp server ids onto local-only catalog rows that share a name.
 * Does not create rows (hydrate owns pull-create) and does not overwrite
 * name/unit/price — those stay with the local offline template or a later hydrate.
 */
export async function adoptServerIdsByName(
  contractorId: string,
  serverItems: ServerCatalogRef[],
): Promise<void> {
  const collection = database.get<CatalogItem>('catalog_items');
  const existing = await collection.query(Q.where('contractor_id', contractorId)).fetch();

  const claimedServerIds = new Set<string>();
  const unmatchedByName = new Map<string, CatalogItem[]>();
  for (const row of existing) {
    if (row.serverId) {
      claimedServerIds.add(row.serverId);
      continue;
    }
    const list = unmatchedByName.get(row.name) ?? [];
    list.push(row);
    unmatchedByName.set(row.name, list);
  }

  await database.write(async () => {
    for (const item of serverItems) {
      if (claimedServerIds.has(item.id)) continue;
      const locals = unmatchedByName.get(item.name);
      const local = locals?.shift();
      if (!local) continue;
      await local.update((record) => {
        record.serverId = item.id;
      });
      claimedServerIds.add(item.id);
    }
  });
}

export async function persistOnlineSeed(
  contractorId: string,
  items: SeedResponse['items'],
): Promise<void> {
  const catalogCollection = database.get<CatalogItem>('catalog_items');
  await database.write(async () => {
    for (const item of items) {
      await catalogCollection.create((record) => {
        record.serverId = item.id;
        record.contractorId = contractorId;
        record.name = item.name;
        record.unit = parseCatalogUnit(item.unit) ?? item.unit;
        record.unitPriceCents = item.unitPriceCents;
        record.tradeCategory = item.tradeCategory;
        record.isArchived = false;
      });
    }
  });
}

/**
 * Write bundled templates with serverId null. Caller must enqueue
 * `{ entityType: 'onboarding', action: 'seed' }` so `/onboarding/seed`
 * runs when back online (sets contractors.trade + catalog_items).
 */
export async function persistOfflineCatalog(contractorId: string, trade: Trade): Promise<number> {
  const template = OFFLINE_TRADE_TEMPLATES[trade];
  const catalogCollection = database.get<CatalogItem>('catalog_items');
  await database.write(async () => {
    for (const item of template) {
      await catalogCollection.create((record) => {
        record.serverId = null;
        record.contractorId = contractorId;
        record.name = item.name;
        record.unit = parseCatalogUnit(item.unit) ?? item.unit;
        record.unitPriceCents = item.unitPriceCents;
        record.tradeCategory = item.tradeCategory;
        record.isArchived = false;
      });
    }
  });
  return template.length;
}

export function onboardingSeedEnqueueParams(
  contractorId: string,
  trade: Trade,
): {
  entityType: 'onboarding';
  entityId: string;
  action: 'seed';
  payload: { trade: Trade };
} {
  return {
    entityType: 'onboarding',
    entityId: contractorId,
    action: 'seed',
    payload: { trade },
  };
}

/**
 * Queue processor for offline onboarding. Prefer POST /onboarding/seed over
 * per-item POST /catalog: seed sets contractors.trade and inserts the
 * bundled template in one request. 409 means the original
 * request likely succeeded after the 5s client timeout — pull and map ids.
 */
export async function syncQueuedOnboardingSeed(contractorId: string, trade: Trade): Promise<void> {
  try {
    const response = await seedCatalog(trade);
    await adoptServerIdsByName(contractorId, response.items);
  } catch (error) {
    if (!isConflictError(error)) throw error;
    const items = await fetchCatalogItems();
    await adoptServerIdsByName(contractorId, items);
  }
}
