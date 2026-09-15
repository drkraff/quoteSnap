import { parseCatalogUnit } from '../catalog/units';
import { typedPriceSource, type PriceSource } from '../utils/price-source';

function isPositiveCents(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Signup markup is 0–100 inclusive. Null/invalid means do not compute a sell price. */
export function parseSignupMarkupPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    return null;
  }
  return value;
}

/**
 * Sell cents from a known material cost and markup %. Integer cents, rounded.
 * Markup 0 is a real rate (sell = cost). Missing either input → null (never invent).
 */
export function computeMaterialSellCents(
  costCents: number | null | undefined,
  markupPercent: number | null | undefined,
): number | null {
  if (!isPositiveCents(costCents)) {
    return null;
  }
  const markup = parseSignupMarkupPercent(markupPercent);
  if (markup == null) {
    return null;
  }
  const sell = Math.round(costCents * (1 + markup / 100));
  return sell > 0 ? sell : null;
}

/** Hour-unit labor never takes material cost × markup. */
export function isLaborLine(unit: string | null | undefined): boolean {
  return parseCatalogUnit(unit) === 'hour';
}

export function centsToDollarText(cents: number | null | undefined): string {
  if (cents == null || cents === 0) {
    return '';
  }
  return (cents / 100).toFixed(2);
}

export type DraftPriceEditInput = {
  costCents: number | null;
  markupPercent: number | null;
  /** Typed or currently stored unit price (cents). */
  unitPriceCents: number | null;
  unitPriceManuallyEdited: boolean;
  costOrMarkupEdited: boolean;
  existingPriceSource?: PriceSource | null;
  isLabor?: boolean;
};

/**
 * Draft Edit Price: live unit price + price_source.
 *
 * Manual unit-price keystrokes win (`known`, or `unknown` if cleared).
 * Else editing cost or markup recomputes; missing either stays blank/unknown.
 * Labor ignores cost × markup. Untouched fields keep the stored snapshot.
 */
export function resolveDraftPriceEdit(input: DraftPriceEditInput): {
  unitPriceCents: number | null;
  priceSource: PriceSource;
} {
  if (input.unitPriceManuallyEdited) {
    const cents = isPositiveCents(input.unitPriceCents) ? input.unitPriceCents : null;
    return { unitPriceCents: cents, priceSource: typedPriceSource(cents) };
  }

  if (input.isLabor) {
    return keepExisting(input);
  }

  if (input.costOrMarkupEdited) {
    const sell = computeMaterialSellCents(input.costCents, input.markupPercent);
    if (sell != null) {
      return { unitPriceCents: sell, priceSource: 'computed' };
    }
    return { unitPriceCents: null, priceSource: 'unknown' };
  }

  return keepExisting(input);
}

function keepExisting(input: DraftPriceEditInput): {
  unitPriceCents: number | null;
  priceSource: PriceSource;
} {
  const cents = isPositiveCents(input.unitPriceCents) ? input.unitPriceCents : null;
  if (cents == null) {
    return { unitPriceCents: null, priceSource: 'unknown' };
  }
  if (input.existingPriceSource) {
    return { unitPriceCents: cents, priceSource: input.existingPriceSource };
  }
  return { unitPriceCents: cents, priceSource: typedPriceSource(cents) };
}
