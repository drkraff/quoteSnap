import {
  FOLLOW_UP_AFTER_DAYS,
  FOLLOW_UP_DAY_MS,
  FOLLOW_UP_DISMISS_LABEL,
  FOLLOW_UP_EMPTY_HEADING,
  FOLLOW_UP_FILTER_LABEL,
  FOLLOW_UP_MARK_LABEL,
  applyDismissFollowUp,
  applyMarkFollowedUp,
  dismissFollowUpAssignment,
  followUpEmptyBody,
  followUpRowView,
  markFollowedUpAssignment,
  quoteNeedsFollowUp,
  quotesNeedingFollowUp,
  sentDaysAgoLabel,
  type FollowUpQuoteInput,
} from './follow-up';

const NOW = new Date('2026-10-04T00:00:00.000Z');
const DAY = FOLLOW_UP_DAY_MS;

function sentQuote(over: Partial<FollowUpQuoteInput> = {}): FollowUpQuoteInput {
  return {
    status: 'sent',
    sentAt: new Date(NOW.getTime() - 10 * DAY),
    isArchived: false,
    ...over,
  };
}

describe('FOLLOW_UP_AFTER_DAYS', () => {
  it('is the single default of 3 days', () => {
    expect(FOLLOW_UP_AFTER_DAYS).toBe(3);
    expect(FOLLOW_UP_DAY_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('quoteNeedsFollowUp', () => {
  it('is due at exactly N days and not one millisecond earlier', () => {
    const exact = sentQuote({ sentAt: new Date(NOW.getTime() - 3 * DAY) });
    const early = sentQuote({ sentAt: new Date(NOW.getTime() - 3 * DAY + 1) });
    const older = sentQuote({ sentAt: new Date(NOW.getTime() - 3 * DAY - 1) });

    expect(quoteNeedsFollowUp(exact, NOW)).toBe(true);
    expect(quoteNeedsFollowUp(early, NOW)).toBe(false);
    expect(quoteNeedsFollowUp(older, NOW)).toBe(true);
  });

  it('uses the passed day count and keeps the default at 3', () => {
    const oneDayAgo = sentQuote({ sentAt: new Date(NOW.getTime() - DAY) });
    expect(quoteNeedsFollowUp(oneDayAgo, NOW, 1)).toBe(true);
    expect(quoteNeedsFollowUp(oneDayAgo, NOW)).toBe(false);
  });

  it('does not qualify a quote with no sent_at', () => {
    expect(quoteNeedsFollowUp(sentQuote({ sentAt: null }), NOW)).toBe(false);
    expect(quoteNeedsFollowUp(sentQuote({ sentAt: undefined }), NOW)).toBe(false);
    expect(quoteNeedsFollowUp(sentQuote({ sentAt: '' }), NOW)).toBe(false);
    expect(quoteNeedsFollowUp(sentQuote({ sentAt: '   ' }), NOW)).toBe(false);
    expect(quoteNeedsFollowUp(sentQuote({ sentAt: 'not-a-date' }), NOW)).toBe(false);
    expect(quoteNeedsFollowUp({ status: 'sent' }, NOW)).toBe(false);
  });

  it('accepts sent_at as epoch milliseconds or an ISO string without inventing one', () => {
    const ms = NOW.getTime() - 3 * DAY;
    expect(quoteNeedsFollowUp(sentQuote({ sentAt: ms }), NOW)).toBe(true);
    expect(
      quoteNeedsFollowUp(sentQuote({ sentAt: new Date(ms).toISOString() }), NOW),
    ).toBe(true);
    expect(quoteNeedsFollowUp(sentQuote({ sentAt: ms + 1 }), NOW)).toBe(false);
  });

  it('never qualifies archived quotes', () => {
    expect(quoteNeedsFollowUp(sentQuote({ isArchived: true }), NOW)).toBe(false);
    expect(quoteNeedsFollowUp(sentQuote({ isArchived: null }), NOW)).toBe(true);
    expect(quoteNeedsFollowUp(sentQuote({ isArchived: false }), NOW)).toBe(true);
  });

  it('stops when the customer has answered or the quote is no longer sent', () => {
    for (const status of ['approved', 'declined', 'expired', 'draft_local', 'draft_queued', 'failed_send', 'ai_failed', 'SENT']) {
      expect(quoteNeedsFollowUp(sentQuote({ status }), NOW)).toBe(false);
    }
  });

  it('snoozes for another N days after followedUpAt, inclusive at the boundary', () => {
    const stillQuiet = sentQuote({ followedUpAt: new Date(NOW.getTime() - 3 * DAY + 1) });
    const quietEnded = sentQuote({ followedUpAt: new Date(NOW.getTime() - 3 * DAY) });

    expect(quoteNeedsFollowUp(stillQuiet, NOW)).toBe(false);
    expect(quoteNeedsFollowUp(quietEnded, NOW)).toBe(true);
  });

  it('hides a quote while snoozedUntil is still in the future', () => {
    const hidden = sentQuote({ snoozedUntil: new Date(NOW.getTime() + 1) });
    const ended = sentQuote({ snoozedUntil: NOW });
    expect(quoteNeedsFollowUp(hidden, NOW)).toBe(false);
    expect(quoteNeedsFollowUp(ended, NOW)).toBe(true);
  });

  it('ignores a junk snooze and does not invent a sent_at from it', () => {
    expect(quoteNeedsFollowUp(sentQuote({ followedUpAt: 'nope', snoozedUntil: 'nope' }), NOW)).toBe(true);
    expect(
      quoteNeedsFollowUp(
        { status: 'sent', sentAt: null, snoozedUntil: new Date(NOW.getTime() - DAY) },
        NOW,
      ),
    ).toBe(false);
  });

  it('stays hidden after dismiss, including either field name', () => {
    expect(quoteNeedsFollowUp(sentQuote({ dismissed: true }), NOW)).toBe(false);
    expect(quoteNeedsFollowUp(sentQuote({ followUpDismissed: true }), NOW)).toBe(false);
    expect(quoteNeedsFollowUp(sentQuote({ dismissed: false, followUpDismissed: null }), NOW)).toBe(true);
  });

  it('does not qualify when now or the day count is unusable', () => {
    const due = sentQuote();
    expect(quoteNeedsFollowUp(due, new Date(Number.NaN))).toBe(false);
    expect(quoteNeedsFollowUp(due, NOW, 0)).toBe(false);
    expect(quoteNeedsFollowUp(due, NOW, Number.NaN)).toBe(false);
  });

  it('does not read a total to decide', () => {
    const due = sentQuote();
    expect(due).not.toHaveProperty('totalCents');
    expect(quoteNeedsFollowUp(due, NOW)).toBe(true);
  });
});

describe('quotesNeedingFollowUp', () => {
  it('returns an empty list for empty input and does not invent rows', () => {
    const input: FollowUpQuoteInput[] = [];
    expect(quotesNeedingFollowUp(input, NOW)).toEqual([]);
    expect(input).toEqual([]);
  });

  it('keeps only due quotes, in input order, without adding fields', () => {
    const due = sentQuote();
    const fresh = sentQuote({ sentAt: NOW });
    const archived = sentQuote({ isArchived: true });
    const missingSent = sentQuote({ sentAt: null });
    const rows = [fresh, due, archived, missingSent];
    const snapshot = rows.map((row) => ({ ...row }));

    const result = quotesNeedingFollowUp(rows, NOW);

    expect(result).toEqual([due]);
    expect(result[0]).toBe(due);
    expect(rows.map((row) => ({ ...row }))).toEqual(snapshot);
    expect(result[0]).not.toHaveProperty('customerName');
    expect(result[0]).not.toHaveProperty('totalCents');
  });
});

describe('follow-up list copy', () => {
  it('uses plain language and does not invent a price, phone, or customer', () => {
    expect(FOLLOW_UP_FILTER_LABEL).toBe('Needs follow-up');
    expect(FOLLOW_UP_EMPTY_HEADING).toBe('No follow-ups');
    expect(FOLLOW_UP_MARK_LABEL).toBe('Mark followed up');
    expect(FOLLOW_UP_DISMISS_LABEL).toBe('Dismiss');
    const body = followUpEmptyBody();
    expect(body).toBe('Sent quotes with no answer for 3 days show up here.');
    expect(followUpEmptyBody(1)).toBe('Sent quotes with no answer for 1 day show up here.');
    const text = `${FOLLOW_UP_EMPTY_HEADING} ${body}`;
    expect(text).not.toMatch(/\$/);
    expect(text.toLowerCase()).not.toContain('phone');
    expect(text).not.toMatch(/\+1/);
    expect(text.toLowerCase()).not.toContain('customer');
  });

  it('labels whole days since send', () => {
    expect(sentDaysAgoLabel(1)).toBe('Sent 1 day ago');
    expect(sentDaysAgoLabel(3)).toBe('Sent 3 days ago');
    expect(sentDaysAgoLabel(0)).toBeNull();
    expect(sentDaysAgoLabel(null)).toBeNull();
  });
});

describe('followUpRowView', () => {
  const sentAt = new Date(NOW.getTime() - 4 * DAY);

  it('shows the customer name, stored total, and Sent N days ago', () => {
    expect(
      followUpRowView({
        customerName: ' Ada ',
        customerPhone: '+15555550100',
        totalCents: 1250,
        sentAt,
        now: NOW,
      }),
    ).toEqual({
      customerName: 'Ada',
      customerPhone: '+15555550100',
      totalDisplay: '$12.50',
      sentLabel: 'Sent 4 days ago',
    });
  });

  it('omits a blank name and phone instead of inventing one', () => {
    const view = followUpRowView({
      customerName: '   ',
      customerPhone: '',
      totalCents: 0,
      sentAt,
      now: NOW,
    });
    expect(view).toEqual({
      customerName: null,
      customerPhone: null,
      totalDisplay: '$0.00',
      sentLabel: 'Sent 4 days ago',
    });
    expect(JSON.stringify(view)).not.toContain('No phone');
    expect(JSON.stringify(view)).not.toContain('Customer');
    expect(JSON.stringify(view)).not.toContain('Unknown');
  });

  it('returns null when sent_at or the total is missing', () => {
    expect(
      followUpRowView({
        customerName: 'Ada',
        totalCents: 1250,
        sentAt: null,
        now: NOW,
      }),
    ).toBeNull();
    expect(
      followUpRowView({
        totalCents: Number.NaN,
        sentAt,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('uses the sent boundary label of 3 days', () => {
    const view = followUpRowView({
      totalCents: 69500,
      sentAt: new Date(NOW.getTime() - 3 * DAY),
      now: NOW,
    });
    expect(view?.sentLabel).toBe('Sent 3 days ago');
    expect(view?.totalDisplay).toBe('$695.00');
    expect(view?.customerName).toBeNull();
  });
});

describe('local follow-up actions', () => {
  it('mark followed up snoozes another N days and does not change money fields', () => {
    const sentAt = new Date(NOW.getTime() - 10 * DAY);
    const record = {
      status: 'sent',
      sentAt,
      followedUpAt: null as Date | null,
      followUpDismissed: null as boolean | null,
      totalCents: 2500,
      customerPhone: null as string | null,
      lineItems: [{ unitPriceCents: 2500 }],
    };

    expect(quoteNeedsFollowUp(record, NOW)).toBe(true);
    applyMarkFollowedUp(record, NOW);

    expect(record.followedUpAt).toBe(NOW);
    expect(record.status).toBe('sent');
    expect(record.sentAt).toBe(sentAt);
    expect(record.totalCents).toBe(2500);
    expect(record.customerPhone).toBeNull();
    expect(record.lineItems).toEqual([{ unitPriceCents: 2500 }]);
    expect(quoteNeedsFollowUp(record, NOW)).toBe(false);
    expect(quoteNeedsFollowUp(record, new Date(NOW.getTime() + 3 * DAY - 1))).toBe(false);
    expect(quoteNeedsFollowUp(record, new Date(NOW.getTime() + 3 * DAY))).toBe(true);
    expect(Object.keys(markFollowedUpAssignment(NOW))).toEqual(['followedUpAt']);
  });

  it('dismiss hides the quote and does not change money, status, or sent_at', () => {
    const sentAt = new Date(NOW.getTime() - 10 * DAY);
    const record = {
      status: 'sent',
      sentAt,
      followedUpAt: null as Date | null,
      followUpDismissed: null as boolean | null,
      totalCents: 2500,
      customerPhone: '+15555550100',
    };

    applyDismissFollowUp(record);

    expect(record.followUpDismissed).toBe(true);
    expect(record.followedUpAt).toBeNull();
    expect(record.status).toBe('sent');
    expect(record.sentAt).toBe(sentAt);
    expect(record.totalCents).toBe(2500);
    expect(record.customerPhone).toBe('+15555550100');
    expect(quoteNeedsFollowUp(record, new Date(NOW.getTime() + 30 * DAY))).toBe(false);
    expect(Object.keys(dismissFollowUpAssignment())).toEqual(['followUpDismissed']);
    expect(dismissFollowUpAssignment()).not.toHaveProperty('totalCents');
    expect(dismissFollowUpAssignment()).not.toHaveProperty('lineItems');
    expect(dismissFollowUpAssignment()).not.toHaveProperty('status');
  });

  it('mark followed up does not clear an existing dismiss', () => {
    const record = {
      status: 'sent',
      sentAt: new Date(NOW.getTime() - 10 * DAY),
      followedUpAt: null as Date | null,
      followUpDismissed: true as boolean | null,
    };
    applyMarkFollowedUp(record, NOW);
    expect(record.followUpDismissed).toBe(true);
    expect(quoteNeedsFollowUp(record, new Date(NOW.getTime() + 3 * DAY))).toBe(false);
  });
});
