/**
 * After a successful customer PDF/HTML share, mark an eligible draft `sent`
 * (and `sent_at`) so thin SYNC-06 freeze applies. Does not invent a phone
 * and does not send SMS (Phase 6). Sharing again on an already-sent quote
 * is a no-op.
 *
 * The PUT carries the stored line snapshot (not a later guessed price) so
 * unsynced edits freeze as what the plumber just shared, instead of parking
 * as Sync issues and letting hydrate clobber local money.
 */

import { database } from '../db';
import { Quote } from '../db/models/quote';
import { enqueue } from '../sync/sync-queue';
import {
  toContractorLineItemSync,
  type CustomerQuoteSource,
} from './customer-payload';

export const SHARE_SENT_ELIGIBLE_STATUSES = [
  'draft_local',
  'draft_queued',
  'ai_failed',
] as const;

export type ShareSentEligibleStatus = (typeof SHARE_SENT_ELIGIBLE_STATUSES)[number];

const SHARE_SENT_ELIGIBLE_SET: ReadonlySet<string> = new Set(SHARE_SENT_ELIGIBLE_STATUSES);

export function shouldMarkQuoteSentAfterShare(status: string): boolean {
  return SHARE_SENT_ELIGIBLE_SET.has(status);
}

export type ShareSentSnapshot = {
  totalCents: number;
  lineItems: ReturnType<typeof toContractorLineItemSync>[];
};

export type ShareSentSyncPayload = {
  status: 'sent';
  totalCents?: number;
  lineItems?: ShareSentSnapshot['lineItems'];
};

/** Stored snapshot at share time. Do not invent customerPhone or prices. */
export function shareSentSnapshotFromSource(source: CustomerQuoteSource): ShareSentSnapshot {
  return {
    totalCents: source.totalCents,
    lineItems: source.lineItems.map((item) => toContractorLineItemSync(item)),
  };
}

/** PUT body: status plus stored lines/total when we have them. Never phone. */
export function shareSentSyncPayload(snapshot?: ShareSentSnapshot | null): ShareSentSyncPayload {
  if (!snapshot) {
    return { status: 'sent' };
  }
  return {
    status: 'sent',
    totalCents: snapshot.totalCents,
    lineItems: snapshot.lineItems,
  };
}

export type ShareSentLocalFields = {
  status: string;
  sentAt: Date | null;
};

/** Mutates `record` when eligible. Returns false for already-sent / frozen no-op. */
export function applyShareSentLocalFields(
  record: ShareSentLocalFields,
  now: Date,
): boolean {
  if (!shouldMarkQuoteSentAfterShare(record.status)) {
    return false;
  }
  record.status = 'sent';
  if (record.sentAt == null) {
    record.sentAt = now;
  }
  return true;
}

export type MarkQuoteSentAfterShareResult = 'sent' | 'noop';

export async function markQuoteSentAfterShare(
  quote: Quote,
  now: Date = new Date(),
  snapshot?: ShareSentSnapshot | null,
): Promise<MarkQuoteSentAfterShareResult> {
  if (!shouldMarkQuoteSentAfterShare(quote.status)) {
    return 'noop';
  }
  await database.write(async () => {
    await quote.update((record) => {
      applyShareSentLocalFields(record, now);
    });
  });
  await enqueue({
    entityType: 'quote',
    entityId: quote.id,
    action: 'update',
    payload: shareSentSyncPayload(snapshot),
  });
  return 'sent';
}
