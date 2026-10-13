/**
 * VAT on the stored line subtotal. Not written onto line prices.
 * Keep in sync with apps/mobile/src/money/vat.ts.
 */

export const POSTGRES_INTEGER_MAX = 2147483647;

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
  if (!Number.isInteger(vatPercent) || vatPercent < 0 || vatPercent > 100) {
    return null;
  }
  const product = subtotalCents * vatPercent;
  if (!Number.isSafeInteger(product)) return null;
  const vat = Math.floor((product + 50) / 100);
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
  return { subtotalCents, vatPercent, vatCents: vat, totalCents };
}
