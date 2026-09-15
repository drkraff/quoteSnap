/**
 * After a successful customer PDF/HTML share, mark an eligible draft `sent`
 * (and `sent_at`) so thin SYNC-06 freeze applies. Does not invent a phone
 * and does not send SMS (Phase 6). Sharing again on an already-sent quote
 * is a no-op.
 */

import { database } from '../db';
import { Quote } from '../db/models/quote';
import { enqueue } from '../sync/sync-queue';

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

/** PUT body: status only. Do not invent customerPhone. */
export function shareSentSyncPayload(): { status: 'sent' } {
  return { status: 'sent' };
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
    payload: shareSentSyncPayload(),
  });
  return 'sent';
}
