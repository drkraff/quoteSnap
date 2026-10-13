/**
 * Onboarding setup rates become catalog rows. A blank name or a blank
 * price is skipped — never a guessed dollar, never a foot/sq ft default.
 */

import { parseCatalogUnit, type CatalogUnit } from './units';

export const LABOR_CATALOG_NAME = 'Labor';

export type SetupRateInput = {
  name: string;
  unit?: string | null;
  unitPriceCents?: number | null;
};

export type SetupCatalogDraft = {
  name: string;
  unit: CatalogUnit;
  unitPriceCents: number;
};

function pushUnique(
  items: SetupCatalogDraft[],
  seen: Set<string>,
  name: string,
  unit: CatalogUnit,
  cents: number,
): void {
  const trimmed = name.trim();
  if (trimmed === '') return;
  if (!Number.isInteger(cents) || cents <= 0) return;
  const key = `${trimmed.toLowerCase()}|${unit}`;
  if (seen.has(key)) return;
  seen.add(key);
  items.push({ name: trimmed, unit, unitPriceCents: cents });
}

/**
 * Hourly labor becomes a Labor / hour catalog item.
 * Each named rate with a positive integer price becomes its own item.
 * A missing unit is `each` (metric), not square feet.
 */
export function catalogItemsFromSetupRates(input: {
  hourlyRateCents?: number | null;
  rates?: SetupRateInput[] | null;
}): SetupCatalogDraft[] {
  const items: SetupCatalogDraft[] = [];
  const seen = new Set<string>();
  const hourly = input.hourlyRateCents;
  if (typeof hourly === 'number') {
    pushUnique(items, seen, LABOR_CATALOG_NAME, 'hour', hourly);
  }
  for (const rate of input.rates ?? []) {
    const cents = rate.unitPriceCents;
    if (typeof cents !== 'number') continue;
    const unit = parseCatalogUnit(rate.unit) ?? 'each';
    pushUnique(items, seen, rate.name, unit, cents);
  }
  return items;
}
