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

/** Israel VAT. 0 is allowed (exempt) and still prints a VAT line. */
export const DEFAULT_VAT_PERCENT = 18;

export const VAT_PERCENT_MIN = 0;
export const VAT_PERCENT_MAX = 100;

export type ContractorLocale = {
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

/** Integer 0–100. Anything else is not a VAT rate. */
export function parseVatPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < VAT_PERCENT_MIN || value > VAT_PERCENT_MAX) return null;
  return value;
}

export function localeFromUnknown(input: {
  currencyCode?: unknown;
  unitSystem?: unknown;
  vatPercent?: unknown;
} | null | undefined): ContractorLocale {
  return {
    currencyCode: parseCurrencyCode(input?.currencyCode) ?? DEFAULT_CURRENCY,
    unitSystem: parseUnitSystem(input?.unitSystem) ?? DEFAULT_UNIT_SYSTEM,
    vatPercent: parseVatPercent(input?.vatPercent) ?? DEFAULT_VAT_PERCENT,
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
