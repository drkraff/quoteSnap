/**
 * Display currency. Stored prices stay integer cents.
 * Keep in sync with apps/mobile/src/money/currency.ts.
 */

export const CURRENCY_CODES = ["ILS", "USD"] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const DEFAULT_CURRENCY: CurrencyCode = "ILS";

export const UNIT_SYSTEMS = ["metric", "imperial"] as const;

export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const DEFAULT_UNIT_SYSTEM: UnitSystem = "metric";

export const DEFAULT_VAT_PERCENT = 18;

export const COUNTRY_CODES = ["US", "IL"] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

/** Onboarding lists the United States first. */
export const ONBOARDING_COUNTRIES: readonly CountryCode[] = ["US", "IL"];

export const TAX_LABEL_SALES = "Sales tax";
export const TAX_LABEL_VAT = "VAT";

export type CountryPreset = {
  countryCode: CountryCode;
  currencyCode: CurrencyCode;
  unitSystem: UnitSystem;
  vatPercent: number;
  taxLabel: string;
};

/**
 * Choosing a country sets currency, units, and the starting tax percent.
 * The percent stays editable. Cents are not converted.
 */
export const COUNTRY_PRESETS: Record<CountryCode, CountryPreset> = {
  US: {
    countryCode: "US",
    currencyCode: "USD",
    unitSystem: "imperial",
    vatPercent: 0,
    taxLabel: TAX_LABEL_SALES,
  },
  IL: {
    countryCode: "IL",
    currencyCode: "ILS",
    unitSystem: "metric",
    vatPercent: DEFAULT_VAT_PERCENT,
    taxLabel: TAX_LABEL_VAT,
  },
};

export function parseCurrencyCode(value: unknown): CurrencyCode | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return (CURRENCY_CODES as readonly string[]).includes(code) ? (code as CurrencyCode) : null;
}

export function parseUnitSystem(value: unknown): UnitSystem | null {
  if (typeof value !== "string") return null;
  const system = value.trim().toLowerCase();
  return (UNIT_SYSTEMS as readonly string[]).includes(system) ? (system as UnitSystem) : null;
}

export function parseVatPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > 100) return null;
  return value;
}

export function parseCountryCode(value: unknown): CountryCode | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return (COUNTRY_CODES as readonly string[]).includes(code) ? (code as CountryCode) : null;
}

/** Missing country keeps the Israel label. Sales tax is only for US. */
export function taxLabelForCountry(country: CountryCode | null | undefined): string {
  return country === "US" ? TAX_LABEL_SALES : TAX_LABEL_VAT;
}

export function countryLabel(country: CountryCode): string {
  return country === "US" ? "United States" : "Israel";
}

/**
 * Spoken-unit hint for voice extract. Labor is always hour.
 * Imperial prefers feet for cable. Metric prefers meters.
 * A missing system stays metric so rows from migration 026 do not flip.
 */
export function voiceUnitRule(system: UnitSystem | null | undefined): string {
  if (system === "imperial") {
    return "unit must be one of: each, hour, meter, sqm, foot, sqft, job. Prefer foot for cable and other length, and sqft for area, unless they said meters. Labor is hour.";
  }
  return "unit must be one of: each, hour, meter, sqm, foot, sqft, job. Prefer meter or sqm unless they said feet or square feet. Labor is hour.";
}

export function currencySymbol(currency: CurrencyCode): string {
  return currency === "USD" ? "$" : "₪";
}

export function formatMoneyCents(
  cents: number | null | undefined,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): string {
  const safe = cents == null || !Number.isFinite(cents) ? 0 : Math.round(cents);
  const sign = safe < 0 ? "-" : "";
  return `${sign}${currencySymbol(currency)}${(Math.abs(safe) / 100).toFixed(2)}`;
}
