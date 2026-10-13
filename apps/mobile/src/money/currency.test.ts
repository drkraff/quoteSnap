import {
  COUNTRY_PRESETS,
  ONBOARDING_COUNTRIES,
  countryChoiceForStoredLocale,
  formatMoneyCents,
  localeFromUnknown,
  parseCurrencyCode,
  parseVatPercent,
  taxLabelForCountry,
} from './currency';

describe('currency', () => {
  it('defaults a missing locale to ILS, metric, and 18% VAT without inventing a country', () => {
    expect(localeFromUnknown(null)).toEqual({
      countryCode: null,
      currencyCode: 'ILS',
      unitSystem: 'metric',
      vatPercent: 18,
    });
    expect(localeFromUnknown({})).toEqual({
      countryCode: null,
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

  it('maps United States first, then Israel, without converting cents', () => {
    expect(ONBOARDING_COUNTRIES[0]).toBe('US');
    expect(COUNTRY_PRESETS.US).toEqual({
      countryCode: 'US',
      currencyCode: 'USD',
      unitSystem: 'imperial',
      vatPercent: 0,
      taxLabel: 'Sales tax',
    });
    expect(COUNTRY_PRESETS.IL).toMatchObject({
      currencyCode: 'ILS',
      unitSystem: 'metric',
      vatPercent: 18,
      taxLabel: 'VAT',
    });
    expect(taxLabelForCountry('US')).toBe('Sales tax');
    expect(taxLabelForCountry(null)).toBe('VAT');
    expect(taxLabelForCountry('IL')).toBe('VAT');
    expect(countryChoiceForStoredLocale(localeFromUnknown(null))).toBe('IL');
    expect(countryChoiceForStoredLocale(localeFromUnknown({ currencyCode: 'USD' }))).toBe('US');
    expect(formatMoneyCents(19500, 'USD')).toBe('$195.00');
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
