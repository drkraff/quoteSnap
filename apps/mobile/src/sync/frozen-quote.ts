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
