/**
 * VAT on the stored line subtotal. Not written onto line prices.
 * Keep in sync with apps/mobile/src/money/vat.ts.
 *
 * Tax is half-up to the nearest cent: subtotal × percent / 100.
 * The percent may have 3 decimal places (8.25). 8.25% of $1,125.00 is $92.81.
 */

import { vatPercentMilli } from "./currency.js";

export const POSTGRES_INTEGER_MAX = 2147483647;

/** Divisor for subtotal cents × thousandths of a percent → cents. */
const VAT_CENT_DIVISOR = 100_000;

export type QuoteVatTotals = {
  subtotalCents: number;
  vatPercent: number;
  vatCents: number;
  totalCents: number;
};

export function vatCents(subtotalCents: number, vatPercent: number): number | null {
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0 || subtotalCents > POSTGRES_INTEGER_MAX) {
    return null;
  }
  const milli = vatPercentMilli(vatPercent);
  if (milli == null) return null;
  const product = subtotalCents * milli;
  if (!Number.isSafeInteger(product)) return null;
  const vat = Math.floor((product + VAT_CENT_DIVISOR / 2) / VAT_CENT_DIVISOR);
  if (!Number.isSafeInteger(vat) || vat > POSTGRES_INTEGER_MAX) return null;
  const total = subtotalCents + vat;
  if (!Number.isSafeInteger(total) || total > POSTGRES_INTEGER_MAX) return null;
  return vat;
}

export function quoteVatTotals(
  subtotalCents: number,
  vatPercent: number,
): QuoteVatTotals | null {
  const vat = vatCents(subtotalCents, vatPercent);
  if (vat == null) return null;
  const totalCents = subtotalCents + vat;
  if (!Number.isSafeInteger(totalCents) || totalCents > POSTGRES_INTEGER_MAX) return null;
  const milli = vatPercentMilli(vatPercent);
  return {
    subtotalCents,
    vatPercent: milli == null ? vatPercent : milli / 1000,
    vatCents: vat,
    totalCents,
  };
}
