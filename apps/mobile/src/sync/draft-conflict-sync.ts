import { fetchQuote } from '../api/quotes';
import { database } from '../db';
import { Draft } from '../db/models/draft';
import { Quote } from '../db/models/quote';
import { applyServerQuoteInWrite, serverLineItemsJsonForContractor } from './apply-server-quote';
import {
  comparableLineItems,
  isDraftContentFork,
  isPreSendDraftStatus,
  type ComparableLine,
} from './draft-conflict';
import {
  dropPendingQuoteDraftUpdatesInWrite,
  ensureNeedsReviewInWrite,
} from './draft-conflict-queue';
import { getServerRevision, rememberServerRevision } from './server-revision';

export type DraftForkOutcome = 'conflict' | 'clear' | 'skipped';

/**
 * GET /quotes/:id and, on a true fork, apply server-as-truth then park needs_review.
 * Network failures return `skipped` so offline send/sync still proceeds.
 */
export async function fetchAndResolveDraftFork(args: {
  quote: Quote;
  draft: Draft;
  localLines: ComparableLine[];
}): Promise<DraftForkOutcome> {
  const serverId = args.quote.serverId;
  if (!serverId) return 'skipped';

  let remote;
  try {
    remote = await fetchQuote(serverId);
  } catch {
    return 'skipped';
  }

  const serverLines = comparableLineItems(remote.lineItems);
  const forked =
    isPreSendDraftStatus(remote.quote.status)
    && isDraftContentFork({
      lastKnownUpdatedAt: getServerRevision(serverId),
      serverUpdatedAt: remote.quote.updatedAt,
      localLines: args.localLines,
      serverLines,
    });

  rememberServerRevision(serverId, remote.quote.updatedAt);
  if (!forked) return 'clear';

  const lineItemsJson = await serverLineItemsJsonForContractor(
    args.quote.contractorId,
    remote.lineItems,
  );
  await database.write(async () => {
    await applyServerQuoteInWrite(args.quote, args.draft, remote.quote, lineItemsJson);
    await dropPendingQuoteDraftUpdatesInWrite(args.quote.id, args.draft.id);
    await ensureNeedsReviewInWrite(args.draft.id);
  });
  return 'conflict';
}
