import { parseLineItems, recalculateTotal } from '../utils/line-items';

/**
 * Query.observe() only re-emits when matching *rows* change (insert/delete,
 * or columns used in WHERE/SORT). Dead-letter UI can use observe() because
 * `status = dead_letter` is in the query — a status write drops the row
 * from the set.
 *
 * The Quotes list shows every quote, sorted by created_at, so status /
 * total_cents / customer_phone / voice_job_id writes would otherwise stay
 * invisible until another quote is created or the screen remounts (FlatList
 * also skips cells when the Model instance identity is unchanged).
 */
export const QUOTE_LIST_OBSERVE_COLUMNS: string[] = [
  'status',
  'total_cents',
  'customer_phone',
  'voice_job_id',
];

/** Stamp status + list total together when the voice poller finishes. */
export function draftReadyLocalFields(lineItemsJson: string): {
  status: 'draft_local';
  totalCents: number;
} {
  return {
    status: 'draft_local',
    totalCents: recalculateTotal(parseLineItems(lineItemsJson)),
  };
}

/**
 * FlatList treats identical Model references as unchanged cells. Include
 * the fields the row displays so a status/total write re-renders in place.
 */
export function quoteListRenderKey(
  quotes: { id: string; status: string; totalCents: number }[],
  online: boolean,
): string {
  const rows = quotes.map((quote) => `${quote.id}:${quote.status}:${quote.totalCents}`).join('|');
  return `${online ? '1' : '0'}:${rows}`;
}
