import {
  DEFAULT_CURRENCY,
  DEFAULT_UNIT_SYSTEM,
  DEFAULT_VAT_PERCENT,
  parseCurrencyCode,
  parseUnitSystem,
  parseVatPercent,
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
  vat_percent?: number | null;
};

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function contractorPublicFromRow(row: ContractorRow): ContractorPublic {
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
    vatPercent: parseVatPercent(row.vat_percent) ?? DEFAULT_VAT_PERCENT,
  };
}
