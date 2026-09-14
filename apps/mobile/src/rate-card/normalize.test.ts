import { displayRateCardName, normalizeRateCardName, rateCardTradeKey } from './normalize';

describe('normalizeRateCardName', () => {
  it('trims, collapses whitespace, and lowercases', () => {
    expect(normalizeRateCardName('  Copper   Pipe  ')).toBe('copper pipe');
    expect(normalizeRateCardName('COPPER PIPE')).toBe('copper pipe');
  });

  it('does not stem or strip punctuation', () => {
    expect(normalizeRateCardName('Pipes')).toBe('pipes');
    expect(normalizeRateCardName('pipe-repair')).toBe('pipe-repair');
  });
});

describe('displayRateCardName / rateCardTradeKey', () => {
  it('keeps casing for display and empty-string for blank trade', () => {
    expect(displayRateCardName('  Copper   Pipe  ')).toBe('Copper Pipe');
    expect(rateCardTradeKey(null)).toBe('');
    expect(rateCardTradeKey('plumbing')).toBe('plumbing');
  });
});
