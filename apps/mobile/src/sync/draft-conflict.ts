/** SYNC-05: server-as-truth for WatermelonDB; pre-send draft forks are not silent. */

export const NEEDS_REVIEW_STATUS = 'needs_review';

export const REVIEW_BEFORE_SENDING = 'Review before sending';

export const REVIEW_BEFORE_SENDING_BODY =
  'This quote changed on the server. Check the line items, then send.';

export const REVIEW_BEFORE_SENDING_ACK = 'Got it';

const PRE_SEND_STATUSES = new Set(['draft_local', 'draft_queued', 'ai_failed']);

const BLOCKING_SYNC_STATUSES = new Set(['pending', 'failed', 'in_progress']);

export type ComparableLine = {
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export function isPreSendDraftStatus(status: string): boolean {
  return PRE_SEND_STATUSES.has(status);
}

export function isNeedsReviewStatus(status: string): boolean {
  return status === NEEDS_REVIEW_STATUS;
}

export function isBlockingSyncStatus(status: string): boolean {
  return BLOCKING_SYNC_STATUSES.has(status);
}

/** Unpushed local work is not a fork until we have a previously observed server revision. */
export function isServerRevisionFork(
  lastKnownUpdatedAt: string | null,
  serverUpdatedAt: string,
): boolean {
  if (lastKnownUpdatedAt == null || lastKnownUpdatedAt === '') return false;
  return lastKnownUpdatedAt !== serverUpdatedAt;
}

export function comparableLineItems(
  items: { name: string; quantity: number; unitPriceCents: number }[],
): ComparableLine[] {
  return items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
  }));
}

export function lineItemsConflict(
  local: ComparableLine[],
  server: ComparableLine[],
): boolean {
  if (local.length !== server.length) return true;
  return local.some((item, index) => {
    const other = server[index];
    if (!other) return true;
    return (
      item.name !== other.name
      || item.quantity !== other.quantity
      || item.unitPriceCents !== other.unitPriceCents
    );
  });
}

/**
 * True fork: server revision moved, and line items differ.
 * Same lines with a newer timestamp is not a draft conflict (idempotent / same edit).
 */
export function isDraftContentFork(args: {
  lastKnownUpdatedAt: string | null;
  serverUpdatedAt: string;
  localLines: ComparableLine[];
  serverLines: ComparableLine[];
}): boolean {
  if (!isServerRevisionFork(args.lastKnownUpdatedAt, args.serverUpdatedAt)) {
    return false;
  }
  return lineItemsConflict(args.localLines, args.serverLines);
}

/** Hydrate: dirty local draft + different server lines on a still-editable quote. */
export function shouldApplyHydrateDraftConflict(args: {
  dirty: boolean;
  serverStatus: string;
  localLines: ComparableLine[];
  serverLines: ComparableLine[];
}): boolean {
  if (!args.dirty) return false;
  if (!isPreSendDraftStatus(args.serverStatus)) return false;
  return lineItemsConflict(args.localLines, args.serverLines);
}

export function sendBlockedByReview(needsReview: boolean): boolean {
  return needsReview;
}

export function lineItemsFromQueuePayload(
  payload: Record<string, unknown>,
): ComparableLine[] | null {
  if (typeof payload.lineItemsJson === 'string') {
    try {
      const parsed: unknown = JSON.parse(payload.lineItemsJson);
      if (!Array.isArray(parsed)) return [];
      return comparableLineItems(
        parsed as { name: string; quantity: number; unitPriceCents: number }[],
      );
    } catch {
      return [];
    }
  }
  if (Array.isArray(payload.lineItems)) {
    return comparableLineItems(
      payload.lineItems as { name: string; quantity: number; unitPriceCents: number }[],
    );
  }
  return null;
}
