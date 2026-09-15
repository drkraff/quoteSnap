import { parseCatalogUnit } from '../catalog/units';
import { displayRateCardName, rateCardTradeKey } from './normalize';
import { rateCardQueueEntityId, type RateCardUpsertPayload } from './learn';

export type RateCardEditSource = {
  displayName: string;
  unit: string;
  trade?: string | null;
};

/**
 * Price edit from My rates. Reuses the existing name+unit+trade key.
 * Returns null instead of inventing a new row (missing unit / non-positive cents).
 */
export function buildRateCardEditPayload(
  entry: RateCardEditSource,
  unitPriceCents: number,
): RateCardUpsertPayload | null {
  if (!Number.isInteger(unitPriceCents) || unitPriceCents <= 0) {
    return null;
  }
  const name = displayRateCardName(entry.displayName);
  if (name === '') {
    return null;
  }
  const unit = parseCatalogUnit(entry.unit);
  if (!unit) {
    return null;
  }
  const trade = rateCardTradeKey(entry.trade);
  return {
    name,
    unit,
    unitPriceCents,
    ...(trade ? { trade } : {}),
    source: 'typed',
  };
}

export function rateCardEditQueueEntityId(entry: RateCardEditSource): string {
  return rateCardQueueEntityId({
    name: entry.displayName,
    unit: parseCatalogUnit(entry.unit) ?? entry.unit,
    trade: rateCardTradeKey(entry.trade) || undefined,
  });
}
