export type QuoteStatusDisplay = {
  label: string;
  bg: string;
  text: string;
};

export type QuotePressTarget = 'none' | 'draft' | 'detail';

const STATUS_DISPLAY: Record<string, QuoteStatusDisplay> = {
  ai_processing: { label: 'Processing', bg: '#e0f0ff', text: '#0066cc' },
  draft_local: { label: 'Draft', bg: '#e0f0ff', text: '#0066cc' },
  draft_queued: { label: 'Queued', bg: '#e0f0ff', text: '#0066cc' },
  sent: { label: 'Sent', bg: '#f0f0f0', text: '#666666' },
  approved: { label: 'Approved', bg: '#dcfce7', text: '#16a34a' },
  declined: { label: 'Declined', bg: '#fee2e2', text: '#dc2626' },
  expired: { label: 'Expired', bg: '#fee2e2', text: '#dc2626' },
  // Phase 6 SMS — label only; no send-retry UI in this PR.
  failed_send: { label: 'Send failed', bg: '#fee2e2', text: '#dc2626' },
  // Voice pipeline — distinct from failed_send (CONTEXT invariant 10).
  ai_failed: { label: "Couldn't process audio", bg: '#fee2e2', text: '#dc2626' },
};

const FALLBACK: QuoteStatusDisplay = {
  label: 'Unknown',
  bg: '#f0f0f0',
  text: '#666666',
};

export function getQuoteStatusDisplay(status: string): QuoteStatusDisplay {
  return STATUS_DISPLAY[status] ?? FALLBACK;
}

/**
 * List-row tap: processing is inert; drafts and failed voice quotes open
 * the editor; everything else (including unused failed_send) is read-only.
 */
export function quotePressTarget(status: string): QuotePressTarget {
  if (status === 'ai_processing') {
    return 'none';
  }
  if (status === 'draft_local' || status === 'ai_failed') {
    return 'draft';
  }
  return 'detail';
}
