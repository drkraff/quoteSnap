import {
  CLIENT_SENTENCE_HINT,
  CLIENT_SENTENCE_LABEL,
  CLIENT_SENTENCE_MAX_LENGTH,
  CLIENT_SENTENCE_PLACEHOLDER,
  normalizeClientSentence,
} from './client-sentence';

describe('normalizeClientSentence', () => {
  it('trims and clears whitespace', () => {
    expect(normalizeClientSentence('  Appliances not included.  ')).toBe(
      'Appliances not included.',
    );
    expect(normalizeClientSentence('')).toBeNull();
    expect(normalizeClientSentence('   ')).toBeNull();
    expect(normalizeClientSentence(null)).toBeNull();
  });

  it('caps length so a transcript cannot dump into the column', () => {
    const tooLong = 'x'.repeat(CLIENT_SENTENCE_MAX_LENGTH + 8);
    expect(normalizeClientSentence(tooLong)?.length).toBe(CLIENT_SENTENCE_MAX_LENGTH);
  });
});

describe('client sentence copy', () => {
  it('labels the field as customer-facing English, never internal-only', () => {
    expect(CLIENT_SENTENCE_LABEL).toBe('Client sentence');
    expect(CLIENT_SENTENCE_HINT.toLowerCase()).toContain('customer');
    expect(CLIENT_SENTENCE_HINT.toLowerCase()).toContain('pdf');
    expect(CLIENT_SENTENCE_HINT.toLowerCase()).not.toContain('internal');
    expect(CLIENT_SENTENCE_PLACEHOLDER.toLowerCase()).toContain('blank');
    expect(CLIENT_SENTENCE_PLACEHOLDER.toLowerCase()).not.toContain('appliances');
    expect(CLIENT_SENTENCE_PLACEHOLDER.toLowerCase()).not.toContain('not included');
    expect(CLIENT_SENTENCE_PLACEHOLDER.toLowerCase()).not.toContain('lighting');
  });
});
