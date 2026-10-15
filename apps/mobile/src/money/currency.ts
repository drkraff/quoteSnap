/**
 * Display currency. Stored prices stay integer cents in the contractor's
 * currency — switching the symbol does not convert an amount.
 * Israel is the default: ₪ ILS.
 */

export const CURRENCY_CODES = ['ILS', 'USD'] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const DEFAULT_CURRENCY: CurrencyCode = 'ILS';

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;

export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const DEFAULT_UNIT_SYSTEM: UnitSystem = 'metric';

/** Israel VAT. 0 is allowed and still prints a tax line. */
export const DEFAULT_VAT_PERCENT = 18;

export const VAT_PERCENT_MIN = 0;
export const VAT_PERCENT_MAX = 100;

export const COUNTRY_CODES = ['US', 'IL'] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

/** Onboarding lists the United States first. */
export const ONBOARDING_COUNTRIES: readonly CountryCode[] = ['US', 'IL'];

export const TAX_LABEL_SALES = 'Sales tax';
export const TAX_LABEL_VAT = 'VAT';

export type CountryPreset = {
  countryCode: CountryCode;
  currencyCode: CurrencyCode;
  unitSystem: UnitSystem;
  vatPercent: number;
  taxLabel: string;
};

/**
 * Choosing a country sets currency, units, and the starting tax percent.
 * The percent stays editable. Stored cents are not converted.
 */
export const COUNTRY_PRESETS: Record<CountryCode, CountryPreset> = {
  US: {
    countryCode: 'US',
    currencyCode: 'USD',
    unitSystem: 'imperial',
    vatPercent: 0,
    taxLabel: TAX_LABEL_SALES,
  },
  IL: {
    countryCode: 'IL',
    currencyCode: 'ILS',
    unitSystem: 'metric',
    vatPercent: DEFAULT_VAT_PERCENT,
    taxLabel: TAX_LABEL_VAT,
  },
};

export type ContractorLocale = {
  /** Null until the contractor picks a country. Does not rewrite currency. */
  countryCode: CountryCode | null;
  currencyCode: CurrencyCode;
  unitSystem: UnitSystem;
  vatPercent: number;
};

export function parseCurrencyCode(value: unknown): CurrencyCode | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return (CURRENCY_CODES as readonly string[]).includes(code) ? (code as CurrencyCode) : null;
}

export function parseUnitSystem(value: unknown): UnitSystem | null {
  if (typeof value !== 'string') return null;
  const system = value.trim().toLowerCase();
  return (UNIT_SYSTEMS as readonly string[]).includes(system) ? (system as UnitSystem) : null;
}

/** Thousandths of a percent. 8.25% is 8250. 100% is 100000. */
export const VAT_PERCENT_MILLI_SCALE = 1000;

const VAT_PERCENT_MILLI_MAX = VAT_PERCENT_MAX * VAT_PERCENT_MILLI_SCALE;

/**
 * Integer thousandths of a percent, or null when the value is not a rate
 * from 0 to 100 with at most 3 decimal places.
 * A stored numeric percent can arrive as "8.250" or "18.000".
 */
export function vatPercentMilli(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const scaled = value * VAT_PERCENT_MILLI_SCALE;
    const milli = Math.round(scaled);
    if (Math.abs(scaled - milli) > 1e-6) return null;
    if (milli < VAT_PERCENT_MIN || milli > VAT_PERCENT_MILLI_MAX) return null;
    return milli;
  }
  if (typeof value === 'string') return milliFromDecimalText(value);
  return null;
}

function milliFromDecimalText(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const frac = match[2] ?? '';
  if (frac.length > 3 && /[^0]/.test(frac.slice(3))) return null;
  const fracMilli = Number((frac + '000').slice(0, 3));
  if (!Number.isInteger(whole) || !Number.isInteger(fracMilli)) return null;
  const milli = whole * VAT_PERCENT_MILLI_SCALE + fracMilli;
  if (milli < VAT_PERCENT_MIN || milli > VAT_PERCENT_MILLI_MAX) return null;
  return milli;
}

/** 0–100 with at most 3 decimal places. 8.25 and "8.250" are 8.25. */
export function parseVatPercent(value: unknown): number | null {
  const milli = vatPercentMilli(value);
  if (milli == null) return null;
  return milli / VAT_PERCENT_MILLI_SCALE;
}

/** "8.25", "18", "0". Empty when the value is not a stored rate. */
export function formatVatPercent(value: number): string {
  const milli = vatPercentMilli(value);
  if (milli == null) return '';
  const whole = Math.trunc(milli / VAT_PERCENT_MILLI_SCALE);
  const frac = milli % VAT_PERCENT_MILLI_SCALE;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(3, '0').replace(/0+$/, '')}`;
}

/**
 * A missing percent on a US account is 0. Israel, and a country that has
 * not been chosen yet, stay at 18. A stored percent is kept either way.
 */
export function vatPercentForCountry(
  country: CountryCode | null | undefined,
  value: unknown,
): number {
  const parsed = parseVatPercent(value);
  if (parsed != null) return parsed;
  return country === 'US' ? 0 : DEFAULT_VAT_PERCENT;
}

export function parseCountryCode(value: unknown): CountryCode | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return (COUNTRY_CODES as readonly string[]).includes(code) ? (code as CountryCode) : null;
}

/** Missing country keeps the Israel label. Sales tax is only for US. */
export function taxLabelForCountry(country: CountryCode | null | undefined): string {
  return country === 'US' ? TAX_LABEL_SALES : TAX_LABEL_VAT;
}

export function countryLabel(country: CountryCode): string {
  return country === 'US' ? 'United States' : 'Israel';
}

/**
 * Settings picker for a contractor who has not stored a country yet.
 * Dollars imply United States. Anything else stays Israel, matching 026.
 */
export function countryChoiceForStoredLocale(locale: ContractorLocale): CountryCode {
  if (locale.countryCode) return locale.countryCode;
  if (locale.currencyCode === 'USD') return 'US';
  return 'IL';
}

export function localeFromUnknown(input: {
  countryCode?: unknown;
  currencyCode?: unknown;
  unitSystem?: unknown;
  vatPercent?: unknown;
} | null | undefined): ContractorLocale {
  const countryCode = parseCountryCode(input?.countryCode);
  return {
    countryCode,
    currencyCode: parseCurrencyCode(input?.currencyCode) ?? DEFAULT_CURRENCY,
    unitSystem: parseUnitSystem(input?.unitSystem) ?? DEFAULT_UNIT_SYSTEM,
    vatPercent: vatPercentForCountry(countryCode, input?.vatPercent),
  };
}

export function currencySymbol(currency: CurrencyCode): string {
  return currency === 'USD' ? '$' : '₪';
}

export function currencyLabel(currency: CurrencyCode): string {
  return currency === 'USD' ? 'US dollar ($)' : 'Israeli shekel (₪)';
}

export function unitSystemLabel(system: UnitSystem): string {
  return system === 'imperial' ? 'Imperial (ft, sq ft)' : 'Metric (m, m²)';
}

/**
 * Integer cents → "₪115.00". Negative cents keep the sign.
 * Non-finite input formats as zero of the chosen currency — callers that
 * mean "blank price" must not call this.
 */
export function formatMoneyCents(
  cents: number | null | undefined,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): string {
  const safe = cents == null || !Number.isFinite(cents) ? 0 : Math.round(cents);
  const sign = safe < 0 ? '-' : '';
  return `${sign}${currencySymbol(currency)}${(Math.abs(safe) / 100).toFixed(2)}`;
}
