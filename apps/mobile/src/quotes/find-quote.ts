export const QUOTE_NOT_FOUND = 'Quote not found';

export type FindQuoteResult<T> =
  | { ok: true; record: T }
  | { ok: false; error: typeof QUOTE_NOT_FOUND };

/**
 * Watermelon `collection.find(id)` rejects when the row is missing.
 * Map that to a contractor-facing error instead of hanging on a spinner.
 */
export async function findQuoteRecord<T>(
  find: () => Promise<T>,
): Promise<FindQuoteResult<T>> {
  try {
    return { ok: true, record: await find() };
  } catch {
    return { ok: false, error: QUOTE_NOT_FOUND };
  }
}
