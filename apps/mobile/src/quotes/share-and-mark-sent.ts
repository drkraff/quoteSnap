/**
 * Share the customer PDF/HTML, then mark `sent` only if the share succeeded.
 * Cancel, empty, unavailable, and share-API failure skip mark-sent (SYNC-06
 * freeze must not apply to a quote the plumber never actually shared).
 * Already-sent re-share is allowed; mark-sent is a no-op and does not rewrite
 * the snapshot. Not Twilio / Phase 6 SMS.
 */

import type { Quote } from '../db/models/quote';
import type { CustomerDocumentBrand } from './customer-document';
import type { CustomerQuoteSource } from './customer-payload';
import {
  markQuoteSentAfterShare,
  type MarkQuoteSentAfterShareResult,
} from './mark-quote-sent';
import {
  defaultShareCustomerQuoteDeps,
  shareCustomerQuote,
  type ShareCustomerQuoteDeps,
  type ShareCustomerQuoteResult,
} from './share-customer-quote';

export type ShareAndMarkSentMarked = MarkQuoteSentAfterShareResult | 'skipped';

export type ShareAndMarkSentResult = {
  share: ShareCustomerQuoteResult;
  marked: ShareAndMarkSentMarked;
};

export type ShareAndMarkSentOptions = {
  shareDeps?: ShareCustomerQuoteDeps;
  markSent?: (quote: Quote, now?: Date) => Promise<MarkQuoteSentAfterShareResult>;
  now?: Date;
};

export async function shareCustomerQuoteAndMarkSent(
  source: CustomerQuoteSource,
  quote: Quote | null | undefined,
  brand: CustomerDocumentBrand = {},
  options: ShareAndMarkSentOptions = {},
): Promise<ShareAndMarkSentResult> {
  const share = await shareCustomerQuote(
    source,
    brand,
    options.shareDeps ?? defaultShareCustomerQuoteDeps(),
  );
  if (!share.ok) {
    return { share, marked: 'skipped' };
  }
  if (!quote) {
    return { share, marked: 'skipped' };
  }
  const markSent = options.markSent ?? markQuoteSentAfterShare;
  const marked = await markSent(quote, options.now);
  return { share, marked };
}
