import { getQuoteStatusDisplay } from './status-display';

export type QuoteRowDisplay = {
  isAiProcessing: boolean;
  phone: string;
  totalDisplay: string;
  processingCaption: 'Processing...' | 'Queued' | null;
  statusLabel: string;
  accessibilityLabel: string;
};

/**
 * Quotes-list row copy. Queued vs Processing is connectivity (UAT 5.2),
 * not `draft_queued` (Phase 6 SMS). Totals come from quote.totalCents.
 */
export function quoteRowDisplay(input: {
  status: string;
  totalCents: number;
  customerPhone: string | null;
  online: boolean;
}): QuoteRowDisplay {
  const isAiProcessing = input.status === 'ai_processing';
  const phone = isAiProcessing ? 'New job' : (input.customerPhone || 'No phone');
  const totalDisplay = `$${(input.totalCents / 100).toFixed(2)}`;
  const statusLabel = getQuoteStatusDisplay(input.status).label;
  const processingCaption = isAiProcessing
    ? input.online
      ? 'Processing...'
      : 'Queued'
    : null;

  const accessibilityLabel = isAiProcessing
    ? input.online
      ? 'Quote processing'
      : 'Quote queued, will upload when online'
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
