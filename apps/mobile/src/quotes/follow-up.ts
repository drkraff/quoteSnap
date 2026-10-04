/**
 * Local "Needs follow-up" decision. One knob: FOLLOW_UP_AFTER_DAYS.
 * A day is 24 hours (epoch milliseconds), not a calendar date.
 * Does not read totals, line items, or invent sent_at / customer name.
 */

export const FOLLOW_UP_AFTER_DAYS = 3;

export const FOLLOW_UP_DAY_MS = 24 * 60 * 60 * 1000;

export const FOLLOW_UP_FILTER_LABEL = 'Needs follow-up';

export const FOLLOW_UP_EMPTY_HEADING = 'No follow-ups';

export const FOLLOW_UP_MARK_LABEL = 'Mark followed up';

export const FOLLOW_UP_DISMISS_LABEL = 'Dismiss';

export type FollowUpInstant = Date | number | string | null | undefined;

export type FollowUpQuoteInput = {
  status: string;
  sentAt?: FollowUpInstant;
  /** Last "Mark followed up". Quiet until this instant plus N days. */
  followedUpAt?: FollowUpInstant;
  /** Explicit hide-until. Quiet while now is still before this instant. */
  snoozedUntil?: FollowUpInstant;
  isArchived?: boolean | null;
  /** Dismiss. Either name is accepted; only strict true hides the quote. */
  dismissed?: boolean | null;
  followUpDismissed?: boolean | null;
};

export function followUpEmptyBody(afterDays: number = FOLLOW_UP_AFTER_DAYS): string {
  const days = Number.isFinite(afterDays) && afterDays > 0 ? afterDays : FOLLOW_UP_AFTER_DAYS;
  const unit = days === 1 ? 'day' : 'days';
  return `Sent quotes with no answer for ${days} ${unit} show up here.`;
}

export function parseFollowUpInstant(value: FollowUpInstant): number | null {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return ms;
}

function quietWindowMs(afterDays: number): number | null {
  if (typeof afterDays !== 'number' || !Number.isFinite(afterDays) || afterDays <= 0) {
    return null;
  }
  return afterDays * FOLLOW_UP_DAY_MS;
}

function isDismissed(quote: FollowUpQuoteInput): boolean {
  return quote.dismissed === true || quote.followUpDismissed === true;
}

/**
 * True when a sent quote has had no customer answer for N days.
 * Approved, declined, and expired never qualify. Archived never qualifies.
 * Missing or invalid sent_at never qualifies. An active snooze hides it.
 */
export function quoteNeedsFollowUp(
  quote: FollowUpQuoteInput,
  now: Date,
  afterDays: number = FOLLOW_UP_AFTER_DAYS,
): boolean {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  if (quote.isArchived === true) return false;
  if (isDismissed(quote)) return false;
  if (quote.status !== 'sent') return false;
  const windowMs = quietWindowMs(afterDays);
  if (windowMs == null) return false;
  const sentMs = parseFollowUpInstant(quote.sentAt);
  if (sentMs == null) return false;
  const nowMs = now.getTime();
  if (nowMs < sentMs + windowMs) return false;
  const followedUpMs = parseFollowUpInstant(quote.followedUpAt);
  if (followedUpMs != null && nowMs < followedUpMs + windowMs) return false;
  const snoozedUntilMs = parseFollowUpInstant(quote.snoozedUntil);
  if (snoozedUntilMs != null && nowMs < snoozedUntilMs) return false;
  return true;
}

/** Same object references, input order. Empty in stays empty. */
export function quotesNeedingFollowUp<T extends FollowUpQuoteInput>(
  quotes: readonly T[],
  now: Date,
  afterDays: number = FOLLOW_UP_AFTER_DAYS,
): T[] {
  return quotes.filter((quote) => quoteNeedsFollowUp(quote, now, afterDays));
}

/** Whole 24-hour days since sent_at. Null when sent_at is missing or in the future. */
export function sentDaysAgo(sentAt: FollowUpInstant, now: Date): number | null {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  const sentMs = parseFollowUpInstant(sentAt);
  if (sentMs == null) return null;
  const elapsed = now.getTime() - sentMs;
  if (elapsed < 0) return null;
  return Math.floor(elapsed / FOLLOW_UP_DAY_MS);
}

/** "Sent N days ago". Null when the count is missing or under 1 day. */
export function sentDaysAgoLabel(days: number | null): string | null {
  if (days == null || !Number.isInteger(days) || days < 1) return null;
  return days === 1 ? 'Sent 1 day ago' : `Sent ${days} days ago`;
}

export function presentCustomerText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type FollowUpRowView = {
  customerName: string | null;
  customerPhone: string | null;
  totalDisplay: string;
  sentLabel: string;
};

/**
 * Row copy from stored fields. Name and phone render only when non-blank.
 * Returns null when sent_at or the total cannot be shown without inventing them.
 */
export function followUpRowView(input: {
  customerName?: string | null;
  customerPhone?: string | null;
  totalCents: number;
  sentAt: FollowUpInstant;
  now: Date;
}): FollowUpRowView | null {
  if (typeof input.totalCents !== 'number' || !Number.isFinite(input.totalCents)) return null;
  const sentLabel = sentDaysAgoLabel(sentDaysAgo(input.sentAt, input.now));
  if (sentLabel == null) return null;
  return {
    customerName: presentCustomerText(input.customerName),
    customerPhone: presentCustomerText(input.customerPhone),
    totalDisplay: `$${(input.totalCents / 100).toFixed(2)}`,
    sentLabel,
  };
}

/** Sets followed_up_at to now. Does not touch money, status, or sent_at. */
export function applyMarkFollowedUp(record: { followedUpAt: Date | null }, now: Date): void {
  record.followedUpAt = now;
}

/** Hides the reminder. Does not touch money, status, or sent_at. */
export function applyDismissFollowUp(record: { followUpDismissed: boolean | null }): void {
  record.followUpDismissed = true;
}

export function markFollowedUpAssignment(now: Date): { followedUpAt: Date } {
  return { followedUpAt: now };
}

export function dismissFollowUpAssignment(): { followUpDismissed: true } {
  return { followUpDismissed: true };
}
