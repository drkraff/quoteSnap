import {
  DEFAULT_CURRENCY,
  DEFAULT_UNIT_SYSTEM,
  parseCountryCode,
  parseCurrencyCode,
  parseUnitSystem,
  vatPercentForCountry,
} from "../money/currency.js";
import type { ContractorPublic } from "../types/auth.js";

export type ContractorRow = {
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  trade: string | null;
  hourly_rate_cents?: number | null;
  markup_percent?: number | null;
  currency_code?: string | null;
  unit_system?: string | null;
  /** pg numeric arrives as a string ("8.250", "18.000"). */
  vat_percent?: number | string | null;
  country_code?: string | null;
};

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function contractorPublicFromRow(row: ContractorRow): ContractorPublic {
  const countryCode = parseCountryCode(row.country_code);
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    displayName: row.display_name,
    trade: row.trade,
    hourlyRateCents: integerOrNull(row.hourly_rate_cents),
    markupPercent: integerOrNull(row.markup_percent),
    currencyCode: parseCurrencyCode(row.currency_code) ?? DEFAULT_CURRENCY,
    unitSystem: parseUnitSystem(row.unit_system) ?? DEFAULT_UNIT_SYSTEM,
    vatPercent: vatPercentForCountry(countryCode, row.vat_percent),
    countryCode,
  };
}
