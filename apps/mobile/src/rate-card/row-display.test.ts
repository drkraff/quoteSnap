import { rateCardRowDisplay, rateCardSourceLabel, rateCardUseCountLabel } from './row-display';

describe('rateCardSourceLabel', () => {
  it('surfaces stored source including imported from old quotes', () => {
    expect(rateCardSourceLabel('imported')).toBe('Imported');
    expect(rateCardSourceLabel('confirmed')).toBe('Confirmed');
    expect(rateCardSourceLabel('typed')).toBe('Typed');
    expect(rateCardSourceLabel('ai')).toBeNull();
  });
});

describe('rateCardUseCountLabel', () => {
  it('pluralizes use count', () => {
    expect(rateCardUseCountLabel(1)).toBe('Used 1 time');
    expect(rateCardUseCountLabel(3)).toBe('Used 3 times');
  });
});

describe('rateCardRowDisplay', () => {
  it('shows last price, unit, use count, and imported source', () => {
    const row = rateCardRowDisplay({
      displayName: 'Copper Pipe',
      unit: 'foot',
      unitPriceCents: 4500,
      useCount: 3,
      source: 'imported',
    });
    expect(row.name).toBe('Copper Pipe');
    expect(row.priceDisplay).toBe('$45.00');
    expect(row.unitLabel).toBe('foot');
    expect(row.useCountLabel).toBe('Used 3 times');
    expect(row.sourceLabel).toBe('Imported');
    expect(row.accessibilityLabel).toContain('imported');
    expect(row.accessibilityLabel).toContain('Double tap to edit');
  });
});
