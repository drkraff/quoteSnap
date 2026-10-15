import { isOutstandingSentMark, payloadMarksQuoteSent, shouldHoldLocalSentQuote } from './sent-mark-hold';

describe('payloadMarksQuoteSent', () => {
  it('matches a sent status and ignores other updates', () => {
    expect(payloadMarksQuoteSent(JSON.stringify({ status: 'sent' }))).toBe(true);
    expect(payloadMarksQuoteSent(JSON.stringify({ status: 'sent', totalCents: 2500 }))).toBe(true);
    expect(payloadMarksQuoteSent(JSON.stringify({ status: 'draft_local' }))).toBe(false);
    expect(payloadMarksQuoteSent('')).toBe(false);
    expect(payloadMarksQuoteSent('not-json')).toBe(false);
  });
});

describe('shouldHoldLocalSentQuote', () => {
  it('holds a local sent quote against an older server draft', () => {
    expect(
      shouldHoldLocalSentQuote({ outstandingSentMark: true, serverStatus: 'draft_local' }),
    ).toBe(true);
    expect(
      shouldHoldLocalSentQuote({ outstandingSentMark: true, serverStatus: 'ai_failed' }),
    ).toBe(true);
  });

  it('does not hold once the server quote is already sent', () => {
    expect(shouldHoldLocalSentQuote({ outstandingSentMark: true, serverStatus: 'sent' })).toBe(
      false,
    );
    expect(
      shouldHoldLocalSentQuote({ outstandingSentMark: false, serverStatus: 'draft_local' }),
    ).toBe(false);
  });

  it('counts dead-letter and in-flight quote updates, not draft line edits', () => {
    expect(
      isOutstandingSentMark({
        entityType: 'quote',
        action: 'update',
        status: 'dead_letter',
        payloadJson: JSON.stringify({ status: 'sent' }),
      }),
    ).toBe(true);
    expect(
      isOutstandingSentMark({
        entityType: 'quote',
        action: 'update',
        status: 'pending',
        payloadJson: JSON.stringify({ status: 'sent', totalCents: 100 }),
      }),
    ).toBe(true);
    expect(
      isOutstandingSentMark({
        entityType: 'draft',
        action: 'update',
        status: 'dead_letter',
        payloadJson: JSON.stringify({ status: 'sent' }),
      }),
    ).toBe(false);
    expect(
      isOutstandingSentMark({
        entityType: 'quote',
        action: 'update',
        status: 'dead_letter',
        payloadJson: JSON.stringify({ status: 'draft_queued' }),
      }),
    ).toBe(false);
  });
});
