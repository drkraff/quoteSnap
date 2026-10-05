/**
 * On-device quote stats. Reads local quote rows only.
 * Does not call the API, read follow-up columns, or invent prices.
 *
 * Window:
 * - Quotes created uses created_at.
 * - Quotes sent, value sent, approved, declined, and still waiting use sent_at.
 * - A finite timestamp is inside a bounded window when start <= t <= end
 *   (both ends inclusive). All time has no start and no end.
 * - Last 30 days is a rolling 30 × 24 hours ending at `now`.
 * - This month is the local calendar month of `now`, from local midnight
 *   on the 1st through `now`.
 *
 * Sent means status is sent, approved, declined, or expired AND sent_at is
 * a real timestamp. failed_send, drafts, and voice statuses are not sent.
 * Still waiting is status sent only. Expired is sent value, not an answer,
 * and not waiting.
 *
 * Archived rule: an archived quote is included in history stats only when
 * it was sent (those four statuses plus a real sent_at). Archived unsent
 * rows are omitted from every count, including quotes created.
 *
 * Blank, null, non-finite, and non-integer totals add 0 cents. They are
 * never filled in from line items. Sums stay integer cents.
 *
 * Approval rate is omitted until at least one sent quote in the window is
 * approved or declined. Then it is approved / (approved + declined),
 * returned as those two integers — not a float.
 */

import { formatDollarAmount } from './customer-document';

export const QUOTE_STATS_WINDOWS = ['last_30_days', 'this_month', 'all_time'] as const;

export type QuoteStatsWindowId = (typeof QUOTE_STATS_WINDOWS)[number];

export const DEFAULT_QUOTE_STATS_WINDOW: QuoteStatsWindowId = 'last_30_days';

/** Rolling window length. Not 30 calendar midnights. */
export const QUOTE_STATS_LAST_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const QUOTE_STATS_SENT_STATUSES = ['sent', 'approved', 'declined', 'expired'] as const;

export type QuoteStatsSentStatus = (typeof QUOTE_STATS_SENT_STATUSES)[number];

const SENT_STATUS_SET: ReadonlySet<string> = new Set(QUOTE_STATS_SENT_STATUSES);

export const QUOTE_STATS_EMPTY_MESSAGE = 'Send your first quote to see numbers here';

export const QUOTE_STATS_WINDOW_OPTIONS: readonly {
  id: QuoteStatsWindowId;
  label: string;
}[] = [
  { id: 'last_30_days', label: 'Last 30 days' },
  { id: 'this_month', label: 'This month' },
  { id: 'all_time', label: 'All time' },
];

export const QUOTE_STATS_LABELS = {
  created: 'Quotes created',
  sent: 'Quotes sent',
  valueSent: 'Value sent',
  approved: 'Approved',
  approvedValue: 'Approved value',
  declined: 'Declined',
  waiting: 'Still waiting',
  approvalRate: 'Approval rate',
} as const;

/** Columns the Stats screen must observe so a local write refreshes the counts. */
export const QUOTE_STATS_OBSERVE_COLUMNS = [
  'status',
  'total_cents',
  'created_at',
  'sent_at',
  'is_archived',
] as const;

export type QuoteStatsInstant = Date | number | string | null | undefined;

export type QuoteStatsQuote = {
  status: string;
  totalCents?: number | null;
  createdAt?: QuoteStatsInstant;
  sentAt?: QuoteStatsInstant;
  isArchived?: boolean | null;
};

export type QuoteStatsApprovalRate = {
  approved: number;
  answered: number;
};

export type QuoteStats = {
  window: QuoteStatsWindowId;
  quotesCreated: number;
  quotesSent: number;
  totalValueSentCents: number;
  approvedCount: number;
  approvedValueCents: number;
  declinedCount: number;
  stillWaitingCount: number;
  /** Null when no approved or declined quote is in the sent set. */
  approvalRate: QuoteStatsApprovalRate | null;
};

export type QuoteStatsBounds = {
  /** Null means no lower bound (all time). */
  startMs: number | null;
  /** Null means no upper bound (all time). */
  endMs: number | null;
};

export type QuoteStatsRow = {
  label: string;
  value: string;
};

export type QuoteStatsViewModel = {
  window: QuoteStatsWindowId;
  empty: boolean;
  emptyMessage: string;
  rows: QuoteStatsRow[];
};

export function parseQuoteStatsInstant(value: QuoteStatsInstant): number | null {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return ms;
}

/** Stored cents only. Anything else is 0 — never rounded and never guessed. */
export function quoteStatsCents(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 0;
  return value;
}

export function normalizeQuoteStatsWindow(windowId: string): QuoteStatsWindowId {
  if (
    windowId === 'last_30_days' ||
    windowId === 'this_month' ||
    windowId === 'all_time'
  ) {
    return windowId;
  }
  return DEFAULT_QUOTE_STATS_WINDOW;
}

export function quoteStatsBounds(windowId: QuoteStatsWindowId, now: Date): QuoteStatsBounds {
  if (windowId === 'all_time') {
    return { startMs: null, endMs: null };
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return { startMs: 1, endMs: 0 };
  }
  const endMs = now.getTime();
  if (windowId === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { startMs: start.getTime(), endMs };
  }
  return { startMs: endMs - QUOTE_STATS_LAST_30_DAYS_MS, endMs };
}

function inWindow(ms: number | null, bounds: QuoteStatsBounds): boolean {
  if (ms == null) return false;
  if (bounds.startMs != null && ms < bounds.startMs) return false;
  if (bounds.endMs != null && ms > bounds.endMs) return false;
  return true;
}

function wasSent(status: string, sentMs: number | null): boolean {
  return sentMs != null && SENT_STATUS_SET.has(status);
}

/**
 * Archived quotes are included in history stats only if they were sent.
 * Active rows (isArchived null or false) stay in the set either way.
 */
export function quoteIncludedInStats(
  quote: QuoteStatsQuote,
  sentMs: number | null = parseQuoteStatsInstant(quote.sentAt),
): boolean {
  if (quote.isArchived === true) return wasSent(quote.status, sentMs);
  return true;
}

export function computeQuoteStats(
  quotes: readonly QuoteStatsQuote[],
  windowId: QuoteStatsWindowId = DEFAULT_QUOTE_STATS_WINDOW,
  now: Date = new Date(),
): QuoteStats {
  const window = normalizeQuoteStatsWindow(windowId);
  const bounds = quoteStatsBounds(window, now);
  let quotesCreated = 0;
  let quotesSent = 0;
  let totalValueSentCents = 0;
  let approvedCount = 0;
  let approvedValueCents = 0;
  let declinedCount = 0;
  let stillWaitingCount = 0;

  for (const quote of quotes) {
    const sentMs = parseQuoteStatsInstant(quote.sentAt);
    if (!quoteIncludedInStats(quote, sentMs)) continue;

    if (inWindow(parseQuoteStatsInstant(quote.createdAt), bounds)) {
      quotesCreated += 1;
    }

    if (!wasSent(quote.status, sentMs) || !inWindow(sentMs, bounds)) continue;

    quotesSent += 1;
    const cents = quoteStatsCents(quote.totalCents);
    totalValueSentCents += cents;

    if (quote.status === 'approved') {
      approvedCount += 1;
      approvedValueCents += cents;
    } else if (quote.status === 'declined') {
      declinedCount += 1;
    } else if (quote.status === 'sent') {
      stillWaitingCount += 1;
    }
  }

  const answered = approvedCount + declinedCount;
  return {
    window,
    quotesCreated,
    quotesSent,
    totalValueSentCents,
    approvedCount,
    approvedValueCents,
    declinedCount,
    stillWaitingCount,
    approvalRate: answered > 0 ? { approved: approvedCount, answered } : null,
  };
}

/** Empty until this window has at least one quote that counts as sent. */
export function quoteStatsView(stats: QuoteStats): QuoteStatsViewModel {
  if (stats.quotesSent === 0) {
    return {
      window: stats.window,
      empty: true,
      emptyMessage: QUOTE_STATS_EMPTY_MESSAGE,
      rows: [],
    };
  }

  const rows: QuoteStatsRow[] = [
    { label: QUOTE_STATS_LABELS.created, value: String(stats.quotesCreated) },
    { label: QUOTE_STATS_LABELS.sent, value: String(stats.quotesSent) },
    {
      label: QUOTE_STATS_LABELS.valueSent,
      value: formatDollarAmount(stats.totalValueSentCents),
    },
    { label: QUOTE_STATS_LABELS.approved, value: String(stats.approvedCount) },
    {
      label: QUOTE_STATS_LABELS.approvedValue,
      value: formatDollarAmount(stats.approvedValueCents),
    },
    { label: QUOTE_STATS_LABELS.declined, value: String(stats.declinedCount) },
    { label: QUOTE_STATS_LABELS.waiting, value: String(stats.stillWaitingCount) },
  ];

  if (stats.approvalRate != null) {
    rows.push({
      label: QUOTE_STATS_LABELS.approvalRate,
      value: `${stats.approvalRate.approved} of ${stats.approvalRate.answered}`,
    });
  }

  return {
    window: stats.window,
    empty: false,
    emptyMessage: QUOTE_STATS_EMPTY_MESSAGE,
    rows,
  };
}
