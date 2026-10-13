export type QuoteStatusDisplay = {
  label: string;
  bg: string;
  text: string;
};

export type QuotePressTarget = 'none' | 'draft' | 'detail';

const STATUS_DISPLAY: Record<string, QuoteStatusDisplay> = {
  ai_processing: { label: 'Processing', bg: '#2a2a2a', text: '#9a9a9a' },
  draft_local: { label: 'Draft', bg: '#2a2a2a', text: '#ffffff' },
  draft_queued: { label: 'On this phone', bg: '#2a2a2a', text: '#9a9a9a' },
  sent: { label: 'Sent', bg: '#2a2a2a', text: '#9a9a9a' },
  approved: { label: 'Approved', bg: '#2a2a2a', text: '#7dcea0' },
  declined: { label: 'Declined', bg: '#2a2a2a', text: '#e35d5d' },
  expired: { label: 'Expired', bg: '#2a2a2a', text: '#e35d5d' },
  failed_send: { label: 'Send failed', bg: '#2a2a2a', text: '#e35d5d' },
  ai_failed: { label: "Couldn't process audio", bg: '#2a2a2a', text: '#e35d5d' },
};

const FALLBACK: QuoteStatusDisplay = {
  label: 'Unknown',
  bg: '#2a2a2a',
  text: '#9a9a9a',
};

export function getQuoteStatusDisplay(status: string): QuoteStatusDisplay {
  return STATUS_DISPLAY[status] ?? FALLBACK;
}

/**
 * List-row tap: processing is inert; drafts and failed voice quotes open
 * the editor (FAIL-04 retry + FAIL-05 manual fallback). failed_send stays
 * read-only until Phase 6.
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
