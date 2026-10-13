/**
 * VAT is a customer-document calculation on the stored line subtotal.
 * It is not written back onto line prices or quotes.total_cents, so a
 * frozen quote (SYNC-06) stays the ex-VAT sum the contractor entered.
 * Half-up integer cents, same rounding as material markup.
 */

export const POSTGRES_INTEGER_MAX = 2147483647;

export type QuoteVatTotals = {
  subtotalCents: number;
  vatPercent: number;
  vatCents: number;
  totalCents: number;
};

/**
 * VAT cents for a non-negative subtotal. Null when the inputs are not
 * integers in range or the result does not fit a signed Postgres integer.
 * Null means "do not invent a tax figure".
 */
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
