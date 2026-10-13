import { formatMoneyCents, type CurrencyCode } from '../money/currency';
import { getQuoteStatusDisplay } from './status-display';
import {
  voiceUploadQueuedAccessibility,
  voiceUploadStillQueued,
} from './voice-upload-queue';

export type QuoteRowDisplay = {
  isAiProcessing: boolean;
  phone: string;
  totalDisplay: string;
  processingCaption: 'Processing...' | 'Saved on phone - will sync when online' | null;
  statusLabel: string;
  accessibilityLabel: string;
};

/**
 * Quotes-list row copy. A waiting voice upload says the quote is saved on
 * the phone (FAIL-03) — not `draft_queued` (Phase 6 SMS).
 * Totals come from quote.totalCents.
 */
export function quoteRowDisplay(input: {
  status: string;
  totalCents: number;
  customerPhone: string | null;
  online: boolean;
  voiceJobId?: string | null;
  currency?: CurrencyCode;
}): QuoteRowDisplay {
  const isAiProcessing = input.status === 'ai_processing';
  const phone = isAiProcessing ? 'New job' : (input.customerPhone || 'No phone');
  const totalDisplay = formatMoneyCents(input.totalCents, input.currency);
  const statusLabel = getQuoteStatusDisplay(input.status).label;
  const uploadQueued = voiceUploadStillQueued(input);
  const processingCaption = isAiProcessing
    ? uploadQueued
      ? 'Saved on phone - will sync when online'
      : 'Processing...'
    : null;

  const accessibilityLabel = isAiProcessing
    ? uploadQueued
      ? voiceUploadQueuedAccessibility(input.online)
      : 'Quote processing'
    : input.status === 'ai_failed'
      ? `Quote status ${statusLabel}, total ${totalDisplay}. Double tap to retry the recording or continue as a draft.`
      : `Quote status ${statusLabel}, total ${totalDisplay}. Double tap to open.`;

  return {
    isAiProcessing,
    phone,
    totalDisplay,
    processingCaption,
    statusLabel,
    accessibilityLabel,
  };
}
