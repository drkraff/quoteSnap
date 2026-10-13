import type { CountryCode, CurrencyCode, UnitSystem } from "../money/currency.js";
import { parseCountryCode, parseCurrencyCode, parseUnitSystem, parseVatPercent } from "../money/currency.js";
import { parseTrade, type SeedQueryFn } from "./seed.js";
import { contractorPublicFromRow, type ContractorRow } from "../auth/contractor-public.js";
import type { ContractorPublic } from "../types/auth.js";
import type { Trade } from "../types/onboarding.js";

export const HOURLY_RATE_REQUIRED_ERROR =
  "hourlyRateCents must be a positive integer (cents)";

export const MARKUP_PERCENT_ERROR = "markupPercent must be an integer from 0 to 100";
export const LOCALE_ERROR = "currencyCode, unitSystem, vatPercent, or countryCode is not valid";

export const SELECT_CONTRACTOR_FOR_PROFILE_SQL =
  "SELECT id FROM contractors WHERE id = $1 FOR UPDATE";

export const UPDATE_CONTRACTOR_PROFILE_SQL = `UPDATE contractors
       SET trade = $1,
           hourly_rate_cents = $2,
           markup_percent = $3,
           currency_code = COALESCE($5, currency_code),
           unit_system = COALESCE($6, unit_system),
           vat_percent = COALESCE($7, vat_percent),
           country_code = COALESCE($8, country_code)
       WHERE id = $4
       RETURNING id, email, phone, display_name, trade, hourly_rate_cents, markup_percent,
                 currency_code, unit_system, vat_percent, country_code`;

export type ParsedOnboardingProfile =
  | { ok: false; error: string }
  | {
      ok: true;
      trade: Trade;
      hourlyRateCents: number;
      markupPercent: number | null;
      currencyCode?: CurrencyCode;
      unitSystem?: UnitSystem;
      vatPercent?: number;
      countryCode?: CountryCode;
    };

export type ProfileOutcome =
  | { status: 400 | 404; json: { error: string } }
  | { status: 200; json: { contractor: ContractorPublic } };

export function parsePositiveCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

export function parseMarkupPercent(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    return { ok: false };
  }
  return { ok: true, value };
}

export function parseOnboardingProfileBody(body: unknown): ParsedOnboardingProfile {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: HOURLY_RATE_REQUIRED_ERROR };
  }
  const record = body as {
    trade?: unknown;
    hourlyRateCents?: unknown;
    markupPercent?: unknown;
  };
  const trade = parseTrade(record.trade);
  if (!trade.ok) {
    return trade;
  }
  const hourlyRateCents = parsePositiveCents(record.hourlyRateCents);
  if (hourlyRateCents == null) {
    return { ok: false, error: HOURLY_RATE_REQUIRED_ERROR };
  }
  const markup = parseMarkupPercent(record.markupPercent);
  if (!markup.ok) {
    return { ok: false, error: MARKUP_PERCENT_ERROR };
  }
  const locale = parseOptionalLocale(record as Record<string, unknown>);
  if (!locale.ok) {
    return { ok: false, error: LOCALE_ERROR };
  }
  return {
    ok: true,
    trade: trade.trade,
    hourlyRateCents,
    markupPercent: markup.value,
    ...locale.value,
  };
}

function parseOptionalLocale(
  record: Record<string, unknown>,
): {
  ok: true;
  value: { currencyCode?: CurrencyCode; unitSystem?: UnitSystem; vatPercent?: number; countryCode?: CountryCode };
} | { ok: false } {
  const value: {
    currencyCode?: CurrencyCode;
    unitSystem?: UnitSystem;
    vatPercent?: number;
    countryCode?: CountryCode;
  } = {};
  if (record.currencyCode !== undefined && record.currencyCode !== null) {
    const currency = parseCurrencyCode(record.currencyCode);
    if (!currency) return { ok: false };
    value.currencyCode = currency;
  }
  if (record.unitSystem !== undefined && record.unitSystem !== null) {
    const system = parseUnitSystem(record.unitSystem);
    if (!system) return { ok: false };
    value.unitSystem = system;
  }
  if (record.vatPercent !== undefined && record.vatPercent !== null) {
    const vat = parseVatPercent(record.vatPercent);
    if (vat == null) return { ok: false };
    value.vatPercent = vat;
  }
  if (record.countryCode !== undefined && record.countryCode !== null) {
    const country = parseCountryCode(record.countryCode);
    if (!country) return { ok: false };
    value.countryCode = country;
  }
  return { ok: true, value };
}

/**
 * Persist trade + hourly (and optional material markup %) without inserting catalog items.
 * First quote works with a zero catalog. Voice attach uses markup_percent only as
 * math: spoken/typed material cost × (1 + markup/100). It never invents a cost.
 */
export async function applyOnboardingProfile(
  queryFn: SeedQueryFn,
  args: {
    contractorId: string;
    trade: Trade;
    hourlyRateCents: number;
    markupPercent: number | null;
    currencyCode?: CurrencyCode;
    unitSystem?: UnitSystem;
    vatPercent?: number;
    countryCode?: CountryCode;
  },
): Promise<ProfileOutcome> {
  const locked = await queryFn(SELECT_CONTRACTOR_FOR_PROFILE_SQL, [args.contractorId]);
  if (locked.rows.length === 0) {
    return { status: 404, json: { error: "Contractor not found" } };
  }

  const updated = await queryFn(UPDATE_CONTRACTOR_PROFILE_SQL, [
    args.trade,
    args.hourlyRateCents,
    args.markupPercent,
    args.contractorId,
    args.currencyCode ?? null,
    args.unitSystem ?? null,
    args.vatPercent ?? null,
    args.countryCode ?? null,
  ]);
  if (updated.rows.length === 0) {
    return { status: 404, json: { error: "Contractor not found" } };
  }

  const contractor = contractorPublicFromRow(updated.rows[0] as ContractorRow);
  return { status: 200, json: { contractor } };
}
