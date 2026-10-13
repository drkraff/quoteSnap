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
