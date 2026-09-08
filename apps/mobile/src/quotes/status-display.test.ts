import { getQuoteStatusDisplay, quotePressTarget } from './status-display';

describe('getQuoteStatusDisplay', () => {
  it('maps every HIST-01 status to a contractor-facing label', () => {
    expect(getQuoteStatusDisplay('ai_processing').label).toBe('Processing');
    expect(getQuoteStatusDisplay('ai_failed').label).toBe("Couldn't process audio");
    expect(getQuoteStatusDisplay('draft_local').label).toBe('Draft');
    expect(getQuoteStatusDisplay('draft_queued').label).toBe('Queued');
    expect(getQuoteStatusDisplay('sent').label).toBe('Sent');
    expect(getQuoteStatusDisplay('approved').label).toBe('Approved');
    expect(getQuoteStatusDisplay('declined').label).toBe('Declined');
    expect(getQuoteStatusDisplay('expired').label).toBe('Expired');
    expect(getQuoteStatusDisplay('failed_send').label).toBe('Send failed');
  });

  it('does not reuse the same label for ai_failed and failed_send', () => {
    const audio = getQuoteStatusDisplay('ai_failed');
    const send = getQuoteStatusDisplay('failed_send');
    expect(audio.label).not.toBe(send.label);
    expect(audio.label).toBe("Couldn't process audio");
    expect(send.label).toBe('Send failed');
  });

  it('falls back for unknown statuses without throwing', () => {
    expect(getQuoteStatusDisplay('nope').label).toBe('Unknown');
    expect(getQuoteStatusDisplay('').label).toBe('Unknown');
  });
});

describe('quotePressTarget', () => {
  it('does not open ai_processing quotes', () => {
    expect(quotePressTarget('ai_processing')).toBe('none');
  });

  it('opens the draft editor for local drafts and failed voice quotes', () => {
    expect(quotePressTarget('draft_local')).toBe('draft');
    expect(quotePressTarget('ai_failed')).toBe('draft');
  });

  it('opens read-only detail for send/history statuses including failed_send', () => {
    expect(quotePressTarget('draft_queued')).toBe('detail');
    expect(quotePressTarget('sent')).toBe('detail');
    expect(quotePressTarget('approved')).toBe('detail');
    expect(quotePressTarget('declined')).toBe('detail');
    expect(quotePressTarget('expired')).toBe('detail');
    expect(quotePressTarget('failed_send')).toBe('detail');
  });

  it('treats unknown statuses as read-only detail', () => {
    expect(quotePressTarget('nope')).toBe('detail');
  });
});
