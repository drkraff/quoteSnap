import { isApiError } from '../api/client';

/**
 * SYNC-06: customer-facing terminal statuses. Line items and money must not
 * be rewritten by draft/catalog sync. No quote_snapshots table (SMS-02/04).
 * failed_send is frozen for money so a retry later can change status only.
 */
export const FROZEN_QUOTE_STATUSES = [
  'sent',
  'approved',
  'declined',
  'expired',
  'failed_send',
] as const;

export type FrozenQuoteStatus = (typeof FROZEN_QUOTE_STATUSES)[number];

const FROZEN_QUOTE_STATUS_SET: ReadonlySet<string> = new Set(FROZEN_QUOTE_STATUSES);

/** Keep in sync with backend `QUOTE_MONEY_FROZEN_ERROR`. */
export const QUOTE_MONEY_FROZEN_ERROR =
  'Quote line items and totals cannot be changed after send';

export const FROZEN_QUOTE_WRITE_MESSAGE =
  'This quote was already sent. Line items and prices cannot be changed.';

export class FrozenQuoteWriteError extends Error {
  constructor(message = QUOTE_MONEY_FROZEN_ERROR) {
    super(message);
    this.name = 'FrozenQuoteWriteError';
  }
}

export function isFrozenQuoteStatus(status: string): boolean {
  return FROZEN_QUOTE_STATUS_SET.has(status);
}

/**
 * A new local draft must not take the server id of a quote that is already
 * sent. That link makes the copy inherit the lock on the next hydrate.
 */
export function shouldAdoptCreatedServerQuote(args: {
  responseStatus: string;
  localStatus: string;
  otherLocalIdsWithSameServerId: readonly string[];
}): boolean {
  return !(
    args.localStatus === 'draft_local'
    && isFrozenQuoteStatus(args.responseStatus)
    && args.otherLocalIdsWithSameServerId.length > 0
  );
}

/**
 * Two local quotes must not share one server id. The oldest row keeps it
 * (the quote that was actually sent). Later rows are duplicates and go
 * back to an editable draft so they can sync as their own quote.
 */
export function quoteIdsToDetachFromSharedServer(
  quotes: readonly { id: string; serverId: string | null; createdAt: number }[],
): string[] {
  const groups = new Map<string, { id: string; createdAt: number }[]>();
  for (const quote of quotes) {
    if (!quote.serverId) continue;
    const list = groups.get(quote.serverId) ?? [];
    list.push({ id: quote.id, createdAt: quote.createdAt });
    groups.set(quote.serverId, list);
  }
  const detach: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    for (const quote of ranked.slice(1)) {
      detach.push(quote.id);
    }
  }
  return detach;
}

/** Remount the draft editor when the route id changes so a sent quote's lock cannot stick. */
export function draftEditorKey(id: string | string[] | undefined): string {
  if (typeof id === 'string') return id;
  if (Array.isArray(id) && typeof id[0] === 'string') return id[0];
  return '';
}

/** Archive PATCH is not a money write. Line replacements and totals are. */
export function payloadMutatesQuoteMoney(payload: Record<string, unknown>): boolean {
  if (payload.isArchived === true || payload.isArchived === false) {
    return false;
  }
  return (
    payload.lineItems !== undefined
    || payload.lineItemsJson !== undefined
    || payload.totalCents !== undefined
  );
}

/**
 * Share-mark-sent PUT: `{ status: 'sent' }` plus the stored snapshot.
 * Local status is already `sent` before this queue item runs; the server
 * may still be a draft. Do not park it as a freeze rewrite.
 */
export function isShareSentSnapshotPayload(payload: Record<string, unknown>): boolean {
  return payload.status === 'sent';
}

/** Skip stale post-share money PUTs. Allow the freeze-transition snapshot. */
export function shouldParkFrozenMoneyPut(
  status: string,
  payload: Record<string, unknown>,
): boolean {
  return (
    isFrozenQuoteStatus(status)
    && payloadMutatesQuoteMoney(payload)
    && !isShareSentSnapshotPayload(payload)
  );
}

export function isFrozenQuoteWriteMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('cannot be changed after send')
    || lower.includes('line items and totals cannot')
    || lower.includes('already sent')
  );
}

export function isFrozenQuoteWriteError(error: unknown): boolean {
  if (error instanceof FrozenQuoteWriteError) return true;
  if (isApiError(error)) {
    return error.status === 409 && isFrozenQuoteWriteMessage(error.error);
  }
  if (error instanceof Error) {
    return isFrozenQuoteWriteMessage(error.message);
  }
  return false;
}
