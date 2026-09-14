import { parseTrade, type SeedQueryFn } from "./seed.js";
import { contractorPublicFromRow, type ContractorRow } from "../auth/contractor-public.js";
import type { ContractorPublic } from "../types/auth.js";
import type { Trade } from "../types/onboarding.js";

export const HOURLY_RATE_REQUIRED_ERROR =
  "hourlyRateCents must be a positive integer (cents)";

export const MARKUP_PERCENT_ERROR = "markupPercent must be an integer from 0 to 100";

export const SELECT_CONTRACTOR_FOR_PROFILE_SQL =
  "SELECT id FROM contractors WHERE id = $1 FOR UPDATE";

export const UPDATE_CONTRACTOR_PROFILE_SQL = `UPDATE contractors
       SET trade = $1, hourly_rate_cents = $2, markup_percent = $3
       WHERE id = $4
       RETURNING id, email, phone, display_name, trade, hourly_rate_cents, markup_percent`;

export type ParsedOnboardingProfile =
  | { ok: false; error: string }
  | {
      ok: true;
      trade: Trade;
      hourlyRateCents: number;
      markupPercent: number | null;
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
  return {
    ok: true,
    trade: trade.trade,
    hourlyRateCents,
    markupPercent: markup.value,
  };
}

/**
 * Persist trade + hourly (and optional markup) without inserting catalog items.
 * First quote works with a zero catalog.
 */
export async function applyOnboardingProfile(
  queryFn: SeedQueryFn,
  args: {
    contractorId: string;
    trade: Trade;
    hourlyRateCents: number;
    markupPercent: number | null;
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
  ]);
  if (updated.rows.length === 0) {
    return { status: 404, json: { error: "Contractor not found" } };
  }

  const contractor = contractorPublicFromRow(updated.rows[0] as ContractorRow);
  return { status: 200, json: { contractor } };
}
