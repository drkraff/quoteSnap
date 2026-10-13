import { formatMoneyCents, localeFromUnknown, parseCurrencyCode, parseVatPercent } from './currency';

describe('currency', () => {
  it('defaults a missing locale to ILS, metric, and 18% VAT', () => {
    expect(localeFromUnknown(null)).toEqual({
      currencyCode: 'ILS',
      unitSystem: 'metric',
      vatPercent: 18,
    });
    expect(localeFromUnknown({})).toEqual({
      currencyCode: 'ILS',
      unitSystem: 'metric',
      vatPercent: 18,
    });
  });

  it('formats integer cents in the chosen currency and does not convert them', () => {
    expect(formatMoneyCents(11500)).toBe('₪115.00');
    expect(formatMoneyCents(11500, 'ILS')).toBe('₪115.00');
    expect(formatMoneyCents(11500, 'USD')).toBe('$115.00');
    expect(formatMoneyCents(40)).toBe('₪0.40');
    expect(formatMoneyCents(0, 'ILS')).toBe('₪0.00');
  });

  it('rejects a currency or VAT rate it cannot store', () => {
    expect(parseCurrencyCode('ils')).toBe('ILS');
    expect(parseCurrencyCode('eur')).toBeNull();
    expect(parseVatPercent(18)).toBe(18);
    expect(parseVatPercent(0)).toBe(0);
    expect(parseVatPercent(18.5)).toBeNull();
    expect(parseVatPercent(101)).toBeNull();
  });
});
