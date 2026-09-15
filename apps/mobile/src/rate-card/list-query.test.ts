import {
  nextRateCardListOffset,
  rateCardListPath,
  rateCardListSearchParam,
  RATE_CARD_LIST_PAGE_SIZE,
} from './list-query';

describe('rateCardListPath', () => {
  it('omits name so GET stays a list, not exact lookup', () => {
    expect(rateCardListPath()).toBe('/rate-card');
    expect(rateCardListPath({ limit: RATE_CARD_LIST_PAGE_SIZE, offset: 0 })).toBe(
      '/rate-card?limit=100&offset=0',
    );
    expect(rateCardListPath()).not.toContain('name=');
    expect(rateCardListPath({ limit: 25, offset: 50 })).not.toContain('unit=');
  });

  it('sends normalized q for substring filter without name=', () => {
    expect(rateCardListPath({ q: '  Copper   PIPE ' })).toBe('/rate-card?q=copper+pipe');
    expect(
      rateCardListPath({
        limit: RATE_CARD_LIST_PAGE_SIZE,
        offset: 0,
        q: 'pipe',
        unit: 'foot',
      }),
    ).toBe('/rate-card?limit=100&offset=0&q=pipe&unit=foot');
    expect(rateCardListPath({ q: 'pipe' })).not.toContain('name=');
    expect(rateCardListPath({ q: '   ' })).toBe('/rate-card');
  });
});

describe('rateCardListSearchParam', () => {
  it('trims and lowercases like the rate-card name key', () => {
    expect(rateCardListSearchParam('  PIPE ')).toBe('pipe');
    expect(rateCardListSearchParam('')).toBeUndefined();
    expect(rateCardListSearchParam('   ')).toBeUndefined();
  });
});

describe('nextRateCardListOffset', () => {
  it('stops when the loaded page covers total', () => {
    expect(nextRateCardListOffset(0, 0)).toBeNull();
    expect(nextRateCardListOffset(100, 100)).toBeNull();
    expect(nextRateCardListOffset(100, 250)).toBe(100);
  });
});
