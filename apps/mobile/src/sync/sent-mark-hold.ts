import { isFrozenQuoteStatus } from './frozen-quote';

const OUTSTANDING_SENT_MARK = new Set(['pending', 'failed', 'in_progress', 'dead_letter']);

/** True when a queue payload is the share "I sent it" update. */
export function payloadMarksQuoteSent(payloadJson: string | null | undefined): boolean {
  if (typeof payloadJson !== 'string' || payloadJson.trim() === '') return false;
  try {
    const payload = JSON.parse(payloadJson) as { status?: unknown };
    return payload.status === 'sent';
  } catch {
    return false;
  }
}

/**
 * A sent mark that has not landed on the server. Pending retries and a
 * dead-letter row both count. The row stays in the queue so it can be retried.
 */
export function isOutstandingSentMark(item: {
  entityType: string;
  action?: string;
  status: string;
  payloadJson?: string | null;
}): boolean {
  if (item.entityType !== 'quote') return false;
  if (item.action != null && item.action !== 'update') return false;
  if (!OUTSTANDING_SENT_MARK.has(item.status)) return false;
  return payloadMarksQuoteSent(item.payloadJson);
}

/**
 * Do not copy an older server draft over a local sent quote while the sent
 * update is still outstanding. A server row that is already frozen is the
 * snapshot to keep.
 */
export function shouldHoldLocalSentQuote(args: {
  outstandingSentMark: boolean;
  serverStatus: string;
}): boolean {
  return args.outstandingSentMark && !isFrozenQuoteStatus(args.serverStatus);
}
