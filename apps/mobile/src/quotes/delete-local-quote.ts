import { parseLineItems } from '../utils/line-items';
import type { QuotesListMode } from './list-mode';

export const DELETE_LOCAL_QUOTE_CONFIRM_TITLE = 'Delete this draft?';

export const DELETE_LOCAL_QUOTE_CONFIRM_MESSAGE =
  'This empty draft was never synced. It will be removed from this device and cannot be restored.';

export type QuoteRowSwipeAction = 'archive' | 'unarchive' | 'delete';

export type HardDeleteLocalQuoteResult = 'deleted' | 'refused';

export type HardDeleteQuoteRecord = {
  id: string;
  serverId: string | null | undefined;
  status: string;
  totalCents?: number;
  destroyPermanently: () => Promise<void>;
};

export type HardDeleteDraftRecord = {
  id: string;
  lineItemsJson?: string | null;
  destroyPermanently: () => Promise<void>;
};

export type HardDeleteQueueRecord = {
  entityType: string;
  entityId: string;
  status?: string | null;
  destroyPermanently: () => Promise<void>;
};

/**
 * Customer-facing emptiness for junk Manual Quotes: no name, qty, or cents.
 * Blank placeholder JSON is empty. Does not invent a price.
 */
export function hasMeaningfulLineItems(lineItemsJson: string | null | undefined): boolean {
  if (lineItemsJson == null || lineItemsJson.trim() === '') return false;
  return parseLineItems(lineItemsJson).some((item) => {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
    const unitPriceCents = typeof item.unitPriceCents === 'number' ? item.unitPriceCents : 0;
    return name.length > 0 || quantity > 0 || unitPriceCents > 0;
  });
}

/**
 * Hard-delete is only for never-synced UAT junk: a local Manual Quote draft
 * with no serverId and no meaningful lines. Anything with a serverId must
 * stay on Archive — hydrate would resurrect a server-backed row.
 */
export function canHardDeleteLocalQuote(input: {
  serverId: string | null | undefined;
  status: string;
  totalCents?: number;
  lineItemsJson?: string | null;
}): boolean {
  const serverId = input.serverId?.trim() ?? '';
  if (serverId) return false;
  if (input.status !== 'draft_local') return false;
  if ((input.totalCents ?? 0) !== 0) return false;
  if (input.lineItemsJson !== undefined && hasMeaningfulLineItems(input.lineItemsJson)) {
    return false;
  }
  return true;
}

export function quoteRowSwipeAction(
  listMode: QuotesListMode,
  canDelete: boolean,
): QuoteRowSwipeAction {
  if (canDelete) return 'delete';
  return listMode === 'archived' ? 'unarchive' : 'archive';
}

/**
 * Drop pending quote/draft/audio queue rows for a hard-deleted local quote so
 * processQueue cannot POST a new server quote after the local row is gone.
 * Leave in_progress items: the queue already checked local existence (or will
 * skip the POST) and will destroy the item on success.
 */
export function shouldDropQueueItemForDeletedLocalQuote(
  item: {
    entityType: string;
    entityId: string;
    status?: string | null;
  },
  quoteId: string,
  draftIds: readonly string[],
): boolean {
  if (item.status === 'in_progress') return false;
  if (item.entityId === quoteId && (item.entityType === 'quote' || item.entityType === 'audio' || item.entityType === 'photo')) {
    return true;
  }
  return item.entityType === 'draft' && draftIds.includes(item.entityId);
}

/** Drop one list row. Does not mint a replacement Manual Quote or prices. */
export function removeQuoteListEntry<T extends { id: string }>(
  quotes: readonly T[],
  id: string,
): T[] {
  return quotes.filter((quote) => quote.id !== id);
}

/**
 * Confirm already happened. Destroy quote + drafts + pending queue rows
 * locally only when the row is a never-synced empty draft. No server delete.
 */
export async function hardDeleteEmptyLocalQuote(input: {
  quote: HardDeleteQuoteRecord;
  drafts: readonly HardDeleteDraftRecord[];
  queueItems: readonly HardDeleteQueueRecord[];
  write: (work: () => Promise<void>) => Promise<unknown>;
}): Promise<HardDeleteLocalQuoteResult> {
  const { quote, drafts, queueItems, write } = input;
  if (
    !canHardDeleteLocalQuote({
      serverId: quote.serverId,
      status: quote.status,
      totalCents: quote.totalCents,
      lineItemsJson: drafts[0]?.lineItemsJson ?? '[]',
    })
  ) {
    return 'refused';
  }
  const draftIds = drafts.map((draft) => draft.id);
  await write(async () => {
    for (const item of queueItems) {
      if (shouldDropQueueItemForDeletedLocalQuote(item, quote.id, draftIds)) {
        await item.destroyPermanently();
      }
    }
    for (const draft of drafts) {
      await draft.destroyPermanently();
    }
    await quote.destroyPermanently();
  });
  return 'deleted';
}
