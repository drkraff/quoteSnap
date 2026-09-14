import type { ContractorPublic } from "../types/auth.js";

export type ContractorRow = {
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  trade: string | null;
  hourly_rate_cents?: number | null;
  markup_percent?: number | null;
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
  };
}
