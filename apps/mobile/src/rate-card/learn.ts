import { parseCatalogUnit, type CatalogUnit } from '../catalog/units';
import { rateCardTradeKey } from './normalize';

export type RateCardLearnLine = {
  name: string;
  unitPriceCents: number;
  catalogItemId?: string;
  unit?: string | null;
  trade?: string | null;
};

export type RateCardCatalogHint = {
  id: string;
  serverId?: string | null;
  unit: string;
  tradeCategory?: string | null;
};

export type RateCardUpsertPayload = {
  name: string;
  unit: CatalogUnit;
  unitPriceCents: number;
  trade?: string;
  source: 'typed';
};

/**
 * Build a POST /rate-card body from a draft price confirmation.
 * Unit comes from the line or the matching catalog row (local id or serverId).
 * Returns null instead of inventing a unit or a non-positive price.
 */
export function buildRateCardLearnPayload(
  line: RateCardLearnLine,
  catalogItems: RateCardCatalogHint[],
): RateCardUpsertPayload | null {
  if (!Number.isInteger(line.unitPriceCents) || line.unitPriceCents <= 0) {
    return null;
  }
  const name = line.name.trim().replace(/\s+/g, ' ');
  if (name === '') {
    return null;
  }

  let unit = parseCatalogUnit(line.unit);
  let trade = rateCardTradeKey(line.trade);

  if (line.catalogItemId) {
    const catalog = catalogItems.find(
      (item) => item.id === line.catalogItemId || item.serverId === line.catalogItemId,
    );
    if (catalog) {
      unit = unit ?? parseCatalogUnit(catalog.unit);
      if (!trade) {
        trade = rateCardTradeKey(catalog.tradeCategory);
      }
    }
  }

  if (!unit) {
    return null;
  }

  return {
    name,
    unit,
    unitPriceCents: line.unitPriceCents,
    ...(trade ? { trade } : {}),
    source: 'typed',
  };
}

export function rateCardQueueEntityId(payload: {
  name: string;
  unit: string;
  trade?: string;
}): string {
  const trade = rateCardTradeKey(payload.trade);
  return `rate-card:${payload.name.trim().replace(/\s+/g, ' ').toLowerCase()}|${payload.unit}|${trade}`;
}
