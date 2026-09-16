/**
 * Share the customer PDF/HTML, then mark `sent` only if the share succeeded.
 * Cancel, empty, unavailable, and share-API failure skip mark-sent (SYNC-06
 * freeze must not apply to a quote the plumber never actually shared).
 * Already-sent re-share is allowed; mark-sent is a no-op and does not rewrite
 * the snapshot. Not Twilio / Phase 6 SMS.
 *
 * Android share sheets resolve even when the plumber closes them, so we ask
 * before freezing. iOS cancel throws and skips this prompt.
 */

import { Alert, Platform } from 'react-native';
import type { Quote } from '../db/models/quote';
import type { CustomerDocumentBrand } from './customer-document';
import type { CustomerQuoteSource } from './customer-payload';
import {
  markQuoteSentAfterShare,
  shareSentSnapshotFromSource,
  shouldMarkQuoteSentAfterShare,
  type MarkQuoteSentAfterShareResult,
  type ShareSentSnapshot,
} from './mark-quote-sent';
import {
  SHARE_QUOTE_CANCELLED,
  SHARE_QUOTE_CONFIRM_SENT_BODY,
  SHARE_QUOTE_CONFIRM_SENT_NO,
  SHARE_QUOTE_CONFIRM_SENT_TITLE,
  SHARE_QUOTE_CONFIRM_SENT_YES,
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
  markSent?: (
    quote: Quote,
    now?: Date,
    snapshot?: ShareSentSnapshot | null,
  ) => Promise<MarkQuoteSentAfterShareResult>;
  confirmSent?: () => Promise<boolean>;
  now?: Date;
};

export type ConfirmShareSentDeps = {
  platform?: string;
  alert?: typeof Alert.alert;
};

/** Android cannot tell share-sheet cancel from send. iOS cancel already throws. */
export function defaultConfirmShareSent(
  deps: ConfirmShareSentDeps = {},
): Promise<boolean> {
  const platform = deps.platform ?? Platform.OS;
  if (platform !== 'android') {
    return Promise.resolve(true);
  }
  const alert = deps.alert ?? ((...args: Parameters<typeof Alert.alert>) => Alert.alert(...args));
  return new Promise((resolve) => {
    alert(
      SHARE_QUOTE_CONFIRM_SENT_TITLE,
      SHARE_QUOTE_CONFIRM_SENT_BODY,
      [
        {
          text: SHARE_QUOTE_CONFIRM_SENT_NO,
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: SHARE_QUOTE_CONFIRM_SENT_YES,
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

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
  if (shouldMarkQuoteSentAfterShare(quote.status)) {
    const confirmSent = options.confirmSent ?? defaultConfirmShareSent;
    const confirmed = await confirmSent();
    if (!confirmed) {
      return {
        share: {
          ok: false,
          reason: 'cancelled',
          message: SHARE_QUOTE_CANCELLED,
        },
        marked: 'skipped',
      };
    }
  }
  const markSent = options.markSent ?? markQuoteSentAfterShare;
  const marked = await markSent(quote, options.now, shareSentSnapshotFromSource(source));
  return { share, marked };
}
