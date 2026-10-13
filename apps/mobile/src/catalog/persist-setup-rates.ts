import { database } from '../db';
import { CatalogItem } from '../db/models/catalog-item';
import { enqueue } from '../sync/sync-queue';
import { catalogCreateSyncPayload } from './create-sync-payload';
import { catalogItemsFromSetupRates, type SetupRateInput } from './setup-rates';

/** Local catalog rows plus the existing catalog create queue. Works offline. */
export async function persistSetupCatalogItems(input: {
  contractorId: string;
  trade: string | null;
  hourlyRateCents?: number | null;
  rates?: SetupRateInput[] | null;
}): Promise<number> {
  const drafts = catalogItemsFromSetupRates({
    hourlyRateCents: input.hourlyRateCents,
    rates: input.rates,
  });
  if (drafts.length === 0 || input.contractorId.trim() === '') return 0;
  const collection = database.get<CatalogItem>('catalog_items');
  const created = await database.write(async () => {
    const rows: CatalogItem[] = [];
    for (const item of drafts) {
      rows.push(
        await collection.create((record) => {
          record.contractorId = input.contractorId;
          record.name = item.name;
          record.unit = item.unit;
          record.unitPriceCents = item.unitPriceCents;
          record.tradeCategory = input.trade;
          record.isArchived = false;
        }),
      );
    }
    return rows;
  });
  for (let index = 0; index < created.length; index += 1) {
    const row = created[index]!;
    const item = drafts[index]!;
    await enqueue({
      entityType: 'catalog_item',
      entityId: row.id,
      action: 'create',
      payload: catalogCreateSyncPayload(item, input.trade),
    });
  }
  return created.length;
}
