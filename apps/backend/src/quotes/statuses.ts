/**
 * HIST-01 quote statuses. Keep in sync with CHECK quotes_status_allowed
 * in 007_money_status_checks.sql and the Watermelon `quotes.status` comment.
 *
 * Client POST/PUT may only write CLIENT_QUOTE_STATUSES (A-06). The voice
 * worker/reaper own ai_processing / ai_failed. Phase 6 owns
 * sent / approved / declined / expired / failed_send.
 *
 * SYNC-06 (thin): FROZEN_QUOTE_STATUSES cannot have line items or totals
 * rewritten by client PUT. There is no quote_snapshots table (SMS-02/04).
 * failed_send is frozen for money so a later catalog/draft sync cannot
 * rewrite what was attempted; Phase 6 retry may later change status only.
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

/** Customer-facing terminal statuses. Line items and totals are write-once. */
export const FROZEN_QUOTE_STATUSES = [
  "sent",
  "approved",
  "declined",
  "expired",
  "failed_send",
] as const;
export type FrozenQuoteStatus = (typeof FROZEN_QUOTE_STATUSES)[number];

/** PUT /quotes/:id 409 when lineItems or totalCents target a frozen quote. */
export const QUOTE_MONEY_FROZEN_ERROR =
  "Quote line items and totals cannot be changed after send";

const QUOTE_STATUS_SET: ReadonlySet<string> = new Set(QUOTE_STATUSES);
const CLIENT_QUOTE_STATUS_SET: ReadonlySet<string> = new Set(CLIENT_QUOTE_STATUSES);
const FROZEN_QUOTE_STATUS_SET: ReadonlySet<string> = new Set(FROZEN_QUOTE_STATUSES);

export function isQuoteStatus(value: string): value is QuoteStatus {
  return QUOTE_STATUS_SET.has(value);
}

export function isClientQuoteStatus(value: string): value is ClientQuoteStatus {
  return CLIENT_QUOTE_STATUS_SET.has(value);
}

export function isFrozenQuoteStatus(value: string): value is FrozenQuoteStatus {
  return FROZEN_QUOTE_STATUS_SET.has(value);
}
