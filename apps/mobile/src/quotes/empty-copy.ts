import {
  ARCHIVED_QUOTES_EMPTY_BODY,
  ARCHIVED_QUOTES_EMPTY_HEADING,
  type QuotesListMode,
} from './list-mode';

/** History-list empty state (A-19). Not the catalog "Add Item" copy. */
export const QUOTES_EMPTY_HEADING = 'No quotes yet';

export const QUOTES_EMPTY_BODY =
  'Record a voice quote or create a manual quote to get started';

/** Calm empty copy for Quotes / Archived. Does not invent a quote, price, or phone. */
export function quotesEmptyCopy(mode: QuotesListMode): { heading: string; body: string } {
  if (mode === 'archived') {
    return { heading: ARCHIVED_QUOTES_EMPTY_HEADING, body: ARCHIVED_QUOTES_EMPTY_BODY };
  }
  return { heading: QUOTES_EMPTY_HEADING, body: QUOTES_EMPTY_BODY };
}
