/**
 * HIST-01 quote statuses. Keep in sync with CHECK quotes_status_allowed
 * in 007_money_status_checks.sql and the Watermelon `quotes.status` comment.
 *
 * Client POST/PUT may only write CLIENT_QUOTE_STATUSES (A-06). The voice
 * worker/reaper own ai_processing / ai_failed. Phase 6 owns
 * sent / approved / declined / expired / failed_send.
 */
export const QUOTE_STATUSES = [
  "ai_processing",
  "ai_failed",
  "draft_local",
  "draft_queued",
  "sent",
  "approved",
  "declined",
  "expired",
  "failed_send",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const CLIENT_QUOTE_STATUSES = ["draft_local", "draft_queued"] as const;
export type ClientQuoteStatus = (typeof CLIENT_QUOTE_STATUSES)[number];

const QUOTE_STATUS_SET: ReadonlySet<string> = new Set(QUOTE_STATUSES);
const CLIENT_QUOTE_STATUS_SET: ReadonlySet<string> = new Set(CLIENT_QUOTE_STATUSES);

export function isQuoteStatus(value: string): value is QuoteStatus {
  return QUOTE_STATUS_SET.has(value);
}

export function isClientQuoteStatus(value: string): value is ClientQuoteStatus {
  return CLIENT_QUOTE_STATUS_SET.has(value);
}
