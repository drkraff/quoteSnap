/**
 * VAT is a customer-document calculation on the stored line subtotal.
 * It is not written back onto line prices or quotes.total_cents, so a
 * frozen quote (SYNC-06) stays the ex-VAT sum the contractor entered.
 * Half-up integer cents, same rounding as material markup.
 * The percent may have 3 decimal places (8.25). 8.25% of $1,125.00 is $92.81.
 */

import { vatPercentMilli } from './currency';

export const POSTGRES_INTEGER_MAX = 2147483647;

/** Divisor for subtotal cents × thousandths of a percent → cents. */
const VAT_CENT_DIVISOR = 100_000;

export type QuoteVatTotals = {
  subtotalCents: number;
  vatPercent: number;
  vatCents: number;
  totalCents: number;
};

/**
 * VAT cents for a non-negative subtotal. Null when the subtotal is not an
 * integer in range, the percent is not 0–100 with at most 3 decimal places,
 * or the result does not fit a signed Postgres integer.
 * Null means "do not invent a tax figure".
 */
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
