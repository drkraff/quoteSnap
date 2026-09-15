import { getQuoteStatusDisplay } from './status-display';
import {
  voiceUploadQueuedAccessibility,
  voiceUploadStillQueued,
} from './voice-upload-queue';

export type QuoteRowDisplay = {
  isAiProcessing: boolean;
  phone: string;
  totalDisplay: string;
  processingCaption: 'Processing...' | 'Queued' | null;
  statusLabel: string;
  accessibilityLabel: string;
};

/**
 * Quotes-list row copy. Queued vs Processing is FAIL-03 / UAT 5.2
 * (offline or upload not yet accepted) — not `draft_queued` (Phase 6 SMS).
 * Totals come from quote.totalCents.
 */
export function quoteRowDisplay(input: {
  status: string;
  totalCents: number;
  customerPhone: string | null;
  online: boolean;
  voiceJobId?: string | null;
}): QuoteRowDisplay {
  const isAiProcessing = input.status === 'ai_processing';
  const phone = isAiProcessing ? 'New job' : (input.customerPhone || 'No phone');
  const totalDisplay = `$${(input.totalCents / 100).toFixed(2)}`;
  const statusLabel = getQuoteStatusDisplay(input.status).label;
  const uploadQueued = voiceUploadStillQueued(input);
  const processingCaption = isAiProcessing
    ? uploadQueued
      ? 'Queued'
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
