import { formatDollarAmount } from './customer-document';
import {
  DEFAULT_QUOTE_STATS_WINDOW,
  QUOTE_STATS_EMPTY_MESSAGE,
  QUOTE_STATS_LABELS,
  QUOTE_STATS_LAST_30_DAYS_MS,
  QUOTE_STATS_OBSERVE_COLUMNS,
  QUOTE_STATS_SENT_STATUSES,
  QUOTE_STATS_WINDOW_OPTIONS,
  computeQuoteStats,
  normalizeQuoteStatsWindow,
  quoteIncludedInStats,
  quoteStatsBounds,
  quoteStatsCents,
  quoteStatsView,
  type QuoteStatsQuote,
  type QuoteStatsWindowId,
} from './quote-stats';

/** 5 Oct 2026 15:00:00.000 local. Month start is 1 Oct local midnight. */
const NOW = new Date(2026, 9, 5, 15, 0, 0, 0);
const LAST_30_START = NOW.getTime() - QUOTE_STATS_LAST_30_DAYS_MS;
const MONTH_START = new Date(2026, 9, 1, 0, 0, 0, 0).getTime();

function quote(partial: Partial<QuoteStatsQuote> & Pick<QuoteStatsQuote, 'status'>): QuoteStatsQuote {
  return {
    totalCents: 0,
    createdAt: NOW,
    sentAt: null,
    isArchived: false,
    ...partial,
  };
}

function stats(
  quotes: readonly QuoteStatsQuote[],
  windowId: QuoteStatsWindowId = 'all_time',
  now: Date = NOW,
) {
  return computeQuoteStats(quotes, windowId, now);
}

describe('empty input', () => {
  it('returns zeros and hides the approval rate', () => {
    const result = stats([]);
    expect(result).toEqual({
      window: 'all_time',
      quotesCreated: 0,
      quotesSent: 0,
      totalValueSentCents: 0,
      approvedCount: 0,
      approvedValueCents: 0,
      declinedCount: 0,
      stillWaitingCount: 0,
      approvalRate: null,
    });
    const view = quoteStatsView(result);
    expect(view.empty).toBe(true);
    expect(view.emptyMessage).toBe(QUOTE_STATS_EMPTY_MESSAGE);
    expect(view.emptyMessage).toBe('Send your first quote to see numbers here');
    expect(view.rows).toEqual([]);
  });

  it('defaults to the last 30 days', () => {
    expect(DEFAULT_QUOTE_STATS_WINDOW).toBe('last_30_days');
    expect(computeQuoteStats([]).window).toBe('last_30_days');
    expect(QUOTE_STATS_WINDOW_OPTIONS.map((option) => option.id)).toEqual([
      'last_30_days',
      'this_month',
      'all_time',
    ]);
    expect(normalizeQuoteStatsWindow('nope')).toBe('last_30_days');
  });
});

describe('window boundaries', () => {
  it('includes the last-30-days start and now, and excludes one millisecond outside', () => {
    const onStart = quote({ status: 'draft_local', createdAt: LAST_30_START });
    const beforeStart = quote({ status: 'draft_local', createdAt: LAST_30_START - 1 });
    const onNow = quote({ status: 'draft_local', createdAt: NOW });
    const afterNow = quote({ status: 'draft_local', createdAt: NOW.getTime() + 1 });

    expect(stats([onStart], 'last_30_days').quotesCreated).toBe(1);
    expect(stats([beforeStart], 'last_30_days').quotesCreated).toBe(0);
    expect(stats([onNow], 'last_30_days').quotesCreated).toBe(1);
    expect(stats([afterNow], 'last_30_days').quotesCreated).toBe(0);

    const bounds = quoteStatsBounds('last_30_days', NOW);
    expect(bounds).toEqual({ startMs: LAST_30_START, endMs: NOW.getTime() });
  });

  it('uses sent_at for sent counts and created_at for created counts', () => {
    const sentInsideCreatedOutside = quote({
      status: 'sent',
      createdAt: LAST_30_START - 1,
      sentAt: NOW,
      totalCents: 1000,
    });
    const createdInsideSentOutside = quote({
      status: 'sent',
      createdAt: NOW,
      sentAt: LAST_30_START - 1,
      totalCents: 2000,
    });

    const inside = stats([sentInsideCreatedOutside], 'last_30_days');
    expect(inside.quotesCreated).toBe(0);
    expect(inside.quotesSent).toBe(1);
    expect(inside.totalValueSentCents).toBe(1000);
    expect(inside.stillWaitingCount).toBe(1);

    const outside = stats([createdInsideSentOutside], 'last_30_days');
    expect(outside.quotesCreated).toBe(1);
    expect(outside.quotesSent).toBe(0);
    expect(outside.totalValueSentCents).toBe(0);
  });

  it('counts this month from local midnight on the 1st through now', () => {
    const atMonthStart = quote({ status: 'draft_local', createdAt: MONTH_START });
    const beforeMonth = quote({ status: 'draft_local', createdAt: MONTH_START - 1 });
    const previousMonthInsideLast30 = quote({
      status: 'sent',
      createdAt: LAST_30_START,
      sentAt: LAST_30_START,
      totalCents: 500,
    });

    expect(stats([atMonthStart], 'this_month').quotesCreated).toBe(1);
    expect(stats([beforeMonth], 'this_month').quotesCreated).toBe(0);
    expect(stats([beforeMonth], 'all_time').quotesCreated).toBe(1);

    const last30 = stats([previousMonthInsideLast30], 'last_30_days');
    const month = stats([previousMonthInsideLast30], 'this_month');
    expect(LAST_30_START).toBeLessThan(MONTH_START);
    expect(last30.quotesSent).toBe(1);
    expect(month.quotesSent).toBe(0);
    expect(month.quotesCreated).toBe(0);

    expect(quoteStatsBounds('this_month', NOW)).toEqual({
      startMs: MONTH_START,
      endMs: NOW.getTime(),
    });
  });

  it('includes a quote created at the first instant when now is month start', () => {
    const monthStart = new Date(2026, 9, 1, 0, 0, 0, 0);
    const created = quote({ status: 'draft_local', createdAt: monthStart });
    const justBefore = quote({ status: 'draft_local', createdAt: monthStart.getTime() - 1 });
    expect(stats([created], 'this_month', monthStart).quotesCreated).toBe(1);
    expect(stats([justBefore], 'this_month', monthStart).quotesCreated).toBe(0);
  });

  it('all time keeps old and future rows that bounded windows drop', () => {
    const ancient = quote({
      status: 'approved',
      createdAt: new Date(2019, 0, 1).getTime(),
      sentAt: new Date(2019, 0, 2).getTime(),
      totalCents: 400,
    });
    const future = quote({
      status: 'sent',
      createdAt: NOW.getTime() + 60_000,
      sentAt: NOW.getTime() + 60_000,
      totalCents: 50,
    });

    const all = stats([ancient, future], 'all_time');
    expect(all.quotesCreated).toBe(2);
    expect(all.quotesSent).toBe(2);
    expect(all.approvedCount).toBe(1);
    expect(all.stillWaitingCount).toBe(1);
    expect(all.totalValueSentCents).toBe(450);

    const last30 = stats([ancient, future], 'last_30_days');
    expect(last30.quotesCreated).toBe(0);
    expect(last30.quotesSent).toBe(0);

    expect(quoteStatsBounds('all_time', NOW)).toEqual({ startMs: null, endMs: null });
  });

  it('an invalid now matches nothing in a bounded window and still counts all time', () => {
    const row = quote({ status: 'sent', sentAt: NOW, totalCents: 100 });
    const invalid = new Date(Number.NaN);
    expect(stats([row], 'last_30_days', invalid).quotesSent).toBe(0);
    expect(stats([row], 'this_month', invalid).quotesSent).toBe(0);
    expect(stats([row], 'all_time', invalid).quotesSent).toBe(1);
  });
});

describe('status mapping', () => {
  const sentAt = NOW;

  it('counts only sent, approved, declined, and expired when sent_at is real', () => {
    expect(QUOTE_STATS_SENT_STATUSES).toEqual(['sent', 'approved', 'declined', 'expired']);

    const rows: QuoteStatsQuote[] = [
      quote({ status: 'draft_local', sentAt, totalCents: 1 }),
      quote({ status: 'draft_queued', sentAt, totalCents: 1 }),
      quote({ status: 'ai_processing', sentAt, totalCents: 1 }),
      quote({ status: 'ai_failed', sentAt, totalCents: 1 }),
      quote({ status: 'failed_send', sentAt, totalCents: 999 }),
      quote({ status: 'sent', sentAt: null, totalCents: 999 }),
      quote({ status: 'sent', sentAt: '', totalCents: 999 }),
      quote({ status: 'sent', sentAt: Number.NaN, totalCents: 999 }),
      quote({ status: 'sent', sentAt, totalCents: 100 }),
      quote({ status: 'approved', sentAt, totalCents: 200 }),
      quote({ status: 'declined', sentAt, totalCents: 300 }),
      quote({ status: 'expired', sentAt, totalCents: 400 }),
      quote({ status: 'unknown', sentAt, totalCents: 1 }),
    ];

    const result = stats(rows);
    expect(result.quotesCreated).toBe(rows.length);
    expect(result.quotesSent).toBe(4);
    expect(result.totalValueSentCents).toBe(1000);
    expect(result.approvedCount).toBe(1);
    expect(result.approvedValueCents).toBe(200);
    expect(result.declinedCount).toBe(1);
    expect(result.stillWaitingCount).toBe(1);
    expect(result.approvalRate).toEqual({ approved: 1, answered: 2 });
  });

  it('does not treat expired as waiting, approved, or declined', () => {
    const result = stats([
      quote({ status: 'expired', sentAt, totalCents: 700 }),
    ]);
    expect(result.quotesSent).toBe(1);
    expect(result.totalValueSentCents).toBe(700);
    expect(result.approvedCount).toBe(0);
    expect(result.declinedCount).toBe(0);
    expect(result.stillWaitingCount).toBe(0);
    expect(result.approvalRate).toBeNull();
  });

  it('still waiting is status sent, even if follow-up fields are present', () => {
    const row = {
      ...quote({ status: 'sent', sentAt, totalCents: 100 }),
      followUpDismissed: true,
      followedUpAt: NOW,
    };
    const result = stats([row]);
    expect(result.stillWaitingCount).toBe(1);
    expect(result.quotesSent).toBe(1);
    expect(result.approvalRate).toBeNull();
  });

  it('a sent quote with no created_at still counts as sent', () => {
    const result = stats([
      quote({ status: 'approved', createdAt: null, sentAt, totalCents: 80 }),
    ]);
    expect(result.quotesCreated).toBe(0);
    expect(result.quotesSent).toBe(1);
    expect(result.approvedCount).toBe(1);
  });
});

describe('null totals', () => {
  it('adds 0 cents for blank totals and does not read line items', () => {
    const blank = {
      status: 'sent',
      totalCents: null,
      createdAt: NOW,
      sentAt: NOW,
      isArchived: false,
      lineItems: [{ unitPriceCents: 99999 }],
    };
    const missing = quote({ status: 'approved', sentAt: NOW, totalCents: undefined });
    const notANumber = quote({ status: 'declined', sentAt: NOW, totalCents: Number.NaN });
    const fractional = quote({ status: 'expired', sentAt: NOW, totalCents: 10.5 });
    const numericString = quote({
      status: 'sent',
      sentAt: NOW,
      totalCents: '1500' as unknown as number,
    });
    const stored = quote({ status: 'approved', sentAt: NOW, totalCents: 2500 });

    expect(quoteStatsCents(null)).toBe(0);
    expect(quoteStatsCents(undefined)).toBe(0);
    expect(quoteStatsCents(Number.NaN)).toBe(0);
    expect(quoteStatsCents(10.5)).toBe(0);
    expect(quoteStatsCents(0)).toBe(0);

    const result = stats([blank, missing, notANumber, fractional, numericString, stored]);
    expect(result.quotesSent).toBe(6);
    expect(result.totalValueSentCents).toBe(2500);
    expect(result.approvedValueCents).toBe(2500);
    expect(result.approvedCount).toBe(2);
    expect(Number.isInteger(result.totalValueSentCents)).toBe(true);
  });

  it('sums integer cents only', () => {
    const result = stats([
      quote({ status: 'sent', sentAt: NOW, totalCents: 1 }),
      quote({ status: 'sent', sentAt: NOW, totalCents: 2 }),
      quote({ status: 'approved', sentAt: NOW, totalCents: null }),
    ]);
    expect(result.totalValueSentCents).toBe(3);
    expect(result.approvedValueCents).toBe(0);
    expect(result.approvedCount).toBe(1);
  });

  it('a sent quote stored at 0 cents is a real send, not a guessed price', () => {
    const result = stats([quote({ status: 'sent', sentAt: NOW, totalCents: 0 })]);
    expect(result.quotesSent).toBe(1);
    expect(result.totalValueSentCents).toBe(0);
    const view = quoteStatsView(result);
    expect(view.empty).toBe(false);
    expect(view.rows.find((row) => row.label === QUOTE_STATS_LABELS.valueSent)?.value).toBe(
      '$0.00',
    );
  });
});

describe('approval rate gating', () => {
  it('stays hidden until a quote is approved or declined', () => {
    expect(stats([]).approvalRate).toBeNull();
    expect(
      stats([quote({ status: 'sent', sentAt: NOW, totalCents: 100 })]).approvalRate,
    ).toBeNull();
    expect(
      stats([quote({ status: 'expired', sentAt: NOW, totalCents: 100 })]).approvalRate,
    ).toBeNull();
    expect(
      stats([
        quote({ status: 'sent', sentAt: NOW }),
        quote({ status: 'expired', sentAt: NOW }),
        quote({ status: 'draft_local' }),
      ]).approvalRate,
    ).toBeNull();
  });

  it('shows the rate for approved only, declined only, and a mix', () => {
    expect(
      stats([quote({ status: 'approved', sentAt: NOW })]).approvalRate,
    ).toEqual({ approved: 1, answered: 1 });
    expect(
      stats([
        quote({ status: 'declined', sentAt: NOW }),
        quote({ status: 'declined', sentAt: NOW }),
      ]).approvalRate,
    ).toEqual({ approved: 0, answered: 2 });
    expect(
      stats([
        quote({ status: 'approved', sentAt: NOW }),
        quote({ status: 'approved', sentAt: NOW }),
        quote({ status: 'declined', sentAt: NOW }),
        quote({ status: 'expired', sentAt: NOW }),
        quote({ status: 'sent', sentAt: NOW }),
      ]).approvalRate,
    ).toEqual({ approved: 2, answered: 3 });
  });

  it('does not put a float or an approval row on the screen when there is no answer', () => {
    const waiting = quoteStatsView(
      stats([
        quote({ status: 'sent', sentAt: NOW, totalCents: 69500 }),
        quote({ status: 'expired', sentAt: NOW, totalCents: 100 }),
      ]),
    );
    expect(waiting.empty).toBe(false);
    expect(waiting.rows.map((row) => row.label)).not.toContain(QUOTE_STATS_LABELS.approvalRate);
    for (const row of waiting.rows) {
      const isCount = /^\d+$/.test(row.value);
      const isDollars = row.value.startsWith('$');
      expect(isCount || isDollars).toBe(true);
    }

    const answered = quoteStatsView(
      stats([
        quote({ status: 'approved', sentAt: NOW, totalCents: 69500 }),
        quote({ status: 'declined', sentAt: NOW, totalCents: 100 }),
        quote({ status: 'sent', sentAt: NOW, totalCents: 50 }),
      ]),
    );
    const rate = answered.rows.find((row) => row.label === QUOTE_STATS_LABELS.approvalRate);
    expect(rate?.value).toBe('1 of 2');
    expect(answered.rows.find((row) => row.label === QUOTE_STATS_LABELS.valueSent)?.value).toBe(
      formatDollarAmount(69650),
    );
    expect(answered.rows.find((row) => row.label === QUOTE_STATS_LABELS.valueSent)?.value).toBe(
      '$696.50',
    );
  });
});

describe('archived rule', () => {
  it('states that archived quotes count only when they were sent', () => {
    const archivedDraft = quote({
      status: 'draft_local',
      isArchived: true,
      totalCents: 5000,
    });
    const archivedFailed = quote({
      status: 'failed_send',
      isArchived: true,
      sentAt: NOW,
      totalCents: 5000,
    });
    const archivedSentWithoutTime = quote({
      status: 'approved',
      isArchived: true,
      sentAt: null,
      totalCents: 5000,
    });
    expect(quoteIncludedInStats(archivedDraft)).toBe(false);
    expect(quoteIncludedInStats(archivedFailed)).toBe(false);
    expect(quoteIncludedInStats(archivedSentWithoutTime)).toBe(false);

    const result = stats([archivedDraft, archivedFailed, archivedSentWithoutTime]);
    expect(result.quotesCreated).toBe(0);
    expect(result.quotesSent).toBe(0);
    expect(result.totalValueSentCents).toBe(0);
    expect(result.approvedCount).toBe(0);
  });

  it('includes an archived quote that was sent', () => {
    const archivedSent = quote({
      status: 'sent',
      isArchived: true,
      sentAt: NOW,
      totalCents: 1500,
    });
    const archivedApproved = quote({
      status: 'approved',
      isArchived: true,
      createdAt: LAST_30_START - 1,
      sentAt: NOW,
      totalCents: 2500,
    });
    const archivedDeclined = quote({
      status: 'declined',
      isArchived: true,
      sentAt: NOW,
      totalCents: null,
    });

    const result = stats([archivedSent, archivedApproved, archivedDeclined], 'last_30_days');
    expect(quoteIncludedInStats(archivedSent)).toBe(true);
    expect(result.quotesCreated).toBe(2);
    expect(result.quotesSent).toBe(3);
    expect(result.totalValueSentCents).toBe(4000);
    expect(result.approvedCount).toBe(1);
    expect(result.approvedValueCents).toBe(2500);
    expect(result.declinedCount).toBe(1);
    expect(result.stillWaitingCount).toBe(1);
    expect(result.approvalRate).toEqual({ approved: 1, answered: 2 });
  });

  it('treats null and false archive flags as active', () => {
    const unset = quote({ status: 'draft_local', isArchived: null, totalCents: 10 });
    const active = quote({ status: 'draft_local', isArchived: false, totalCents: 10 });
    expect(stats([unset, active]).quotesCreated).toBe(2);
    expect(stats([unset, active]).quotesSent).toBe(0);
    expect(quoteStatsView(stats([unset, active])).empty).toBe(true);
  });
});

describe('quote stats view', () => {
  it('lists plain-English rows and uses the existing dollar formatter', () => {
    const view = quoteStatsView(
      stats([
        quote({ status: 'draft_local', totalCents: 0 }),
        quote({ status: 'approved', sentAt: NOW, totalCents: 69500 }),
        quote({ status: 'declined', sentAt: NOW, totalCents: 0 }),
      ]),
    );
    expect(view.empty).toBe(false);
    expect(view.rows).toEqual([
      { label: 'Quotes created', value: '3' },
      { label: 'Quotes sent', value: '2' },
      { label: 'Value sent', value: formatDollarAmount(69500) },
      { label: 'Approved', value: '1' },
      { label: 'Approved value', value: formatDollarAmount(69500) },
      { label: 'Declined', value: '1' },
      { label: 'Still waiting', value: '0' },
      { label: 'Approval rate', value: '1 of 2' },
    ]);
  });

  it('observes the columns the counts read', () => {
    expect([...QUOTE_STATS_OBSERVE_COLUMNS]).toEqual([
      'status',
      'total_cents',
      'created_at',
      'sent_at',
      'is_archived',
    ]);
  });
});
