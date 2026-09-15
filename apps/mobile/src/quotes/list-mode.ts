export type QuotesListMode = 'active' | 'archived';

export const QUOTES_LIST_MODE_ACTIVE_LABEL = 'Quotes';
export const QUOTES_LIST_MODE_ARCHIVED_LABEL = 'Archived';

export const ARCHIVED_QUOTES_HEADER_TITLE = 'Archived';
export const ACTIVE_QUOTES_HEADER_TITLE = 'Quote History';

export const ARCHIVED_QUOTES_EMPTY_HEADING = 'No archived quotes';

export const ARCHIVED_QUOTES_EMPTY_BODY =
  'Quotes you archive will show up here. Swipe to unarchive.';

/** Matches Quotes-list Watermelon WHERE (null/false = active). */
export function quoteMatchesListMode(
  isArchived: boolean | null | undefined,
  mode: QuotesListMode,
): boolean {
  const archived = isArchived === true;
  return mode === 'archived' ? archived : !archived;
}

/**
 * Quotes ↔ Archived visibility. Empty input stays empty — never invents a
 * quote row, total, or customer phone.
 */
export function quotesForListMode<T extends { isArchived?: boolean | null }>(
  quotes: readonly T[],
  mode: QuotesListMode,
): T[] {
  return quotes.filter((quote) => quoteMatchesListMode(quote.isArchived, mode));
}
