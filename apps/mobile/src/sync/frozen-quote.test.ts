import {
  FrozenQuoteWriteError,
  FROZEN_QUOTE_STATUSES,
  FROZEN_QUOTE_WRITE_MESSAGE,
  QUOTE_MONEY_FROZEN_ERROR,
  isFrozenQuoteStatus,
  isFrozenQuoteWriteError,
  isFrozenQuoteWriteMessage,
  payloadMutatesQuoteMoney,
} from './frozen-quote';

describe('frozen quote statuses (SYNC-06)', () => {
  it('freezes sent, approved, declined, expired, and failed_send', () => {
    expect([...FROZEN_QUOTE_STATUSES]).toEqual([
      'sent',
      'approved',
      'declined',
      'expired',
      'failed_send',
    ]);
    for (const status of FROZEN_QUOTE_STATUSES) {
      expect(isFrozenQuoteStatus(status)).toBe(true);
    }
  });

  it('keeps drafts and voice-pipeline statuses writable', () => {
    expect(isFrozenQuoteStatus('draft_local')).toBe(false);
    expect(isFrozenQuoteStatus('draft_queued')).toBe(false);
    expect(isFrozenQuoteStatus('ai_failed')).toBe(false);
    expect(isFrozenQuoteStatus('ai_processing')).toBe(false);
  });

  it('treats line replacements and totals as money writes, not archive', () => {
    expect(payloadMutatesQuoteMoney({ lineItems: [] })).toBe(true);
    expect(
      payloadMutatesQuoteMoney({
        lineItemsJson: '[]',
        totalCents: 1500,
      }),
    ).toBe(true);
    expect(payloadMutatesQuoteMoney({ totalCents: 0 })).toBe(true);
    expect(payloadMutatesQuoteMoney({ isArchived: true })).toBe(false);
    expect(payloadMutatesQuoteMoney({ isArchived: false })).toBe(false);
    expect(payloadMutatesQuoteMoney({ customerPhone: '+15555550100' })).toBe(false);
    expect(payloadMutatesQuoteMoney({ status: 'draft_queued' })).toBe(false);
    expect(payloadMutatesQuoteMoney({ privateNote: 'subcontractor check' })).toBe(false);
    expect(payloadMutatesQuoteMoney({ privateNote: null })).toBe(false);
    expect(payloadMutatesQuoteMoney({ privateNote: '' })).toBe(false);
    expect(
      payloadMutatesQuoteMoney({
        clientSentence: 'Appliances and decorative lighting not included.',
      }),
    ).toBe(false);
  });

  it('recognizes the server freeze 409 and the contractor-facing copy', () => {
    expect(isFrozenQuoteWriteMessage(QUOTE_MONEY_FROZEN_ERROR)).toBe(true);
    expect(isFrozenQuoteWriteMessage(FROZEN_QUOTE_WRITE_MESSAGE)).toBe(true);
    expect(isFrozenQuoteWriteMessage('Quote cannot be updated in its current status')).toBe(
      false,
    );
    expect(isFrozenQuoteWriteError(new FrozenQuoteWriteError())).toBe(true);
    expect(
      isFrozenQuoteWriteError({
        status: 409,
        error: QUOTE_MONEY_FROZEN_ERROR,
      }),
    ).toBe(true);
    expect(
      isFrozenQuoteWriteError({
        status: 409,
        error: 'Quote cannot be updated in its current status',
      }),
    ).toBe(false);
  });
});
