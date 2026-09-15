import { normalizeTradeCategory } from "../catalog/create.js";
import {
  catalogUnitErrorMessage,
  parseCatalogUnit,
  type CatalogUnit,
} from "../catalog/units.js";
import type {
  RateCardEntryResponse,
  RateCardHistoryEntry,
  RateCardSource,
} from "../types/rate-card.js";
import { displayRateCardName, normalizeRateCardName, rateCardTradeKey } from "./normalize.js";

export type RateCardQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export const RATE_CARD_HISTORY_CAP = 20;

export const RATE_CARD_COLUMNS =
  "id, contractor_id, normalized_name, display_name, unit, trade, trade_key, unit_price_cents, use_count, source, price_history, created_at, updated_at";

export const SELECT_RATE_CARD_BY_KEY_SQL = `SELECT ${RATE_CARD_COLUMNS}
       FROM rate_card_entries
       WHERE contractor_id = $1 AND normalized_name = $2 AND unit = $3 AND trade_key = $4`;

export const INSERT_RATE_CARD_SQL = `INSERT INTO rate_card_entries
         (contractor_id, normalized_name, display_name, unit, trade, unit_price_cents, use_count, source, price_history)
         VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8::jsonb)
         RETURNING ${RATE_CARD_COLUMNS}`;

export const UPDATE_RATE_CARD_SQL = `UPDATE rate_card_entries
         SET display_name = $1,
             unit_price_cents = $2,
             use_count = use_count + 1,
             source = $3,
             price_history = $4::jsonb
         WHERE id = $5 AND contractor_id = $6
         RETURNING ${RATE_CARD_COLUMNS}`;

export type RateCardRow = {
  id: string;
  contractor_id: string;
  normalized_name: string;
  display_name: string;
  unit: string;
  trade: string | null;
  trade_key: string;
  unit_price_cents: number;
  use_count: number;
  source: RateCardSource;
  price_history: unknown;
  created_at: Date;
  updated_at: Date;
};

export type ParsedRateCardUpsert =
  | { ok: false; error: string }
  | {
      ok: true;
      displayName: string;
      normalizedName: string;
      unit: CatalogUnit;
      trade: string | null;
      tradeKey: string;
      unitPriceCents: number;
      source: RateCardSource;
    };

export type ParsedRateCardLookup =
  | { ok: false; error: string }
  | {
      ok: true;
      normalizedName: string;
      unit: CatalogUnit;
      tradeKey: string;
    };

export type RateCardUpsertOutcome =
  | { status: 400; json: { error: string } }
  | { status: 200; json: { entry: RateCardEntryResponse } };

export type RateCardLookupOutcome =
  | { status: 400; json: { error: string } }
  | { status: 200; json: { entry: RateCardEntryResponse | null } };

function asBodyObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

function queryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function parseSource(value: unknown): { ok: true; source: RateCardSource } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, source: "typed" };
  }
  if (value === "typed" || value === "confirmed" || value === "imported") {
    return { ok: true, source: value };
  }
  return { ok: false, error: "source must be typed, confirmed, or imported" };
}

export function parseHistoryEntry(value: unknown): RateCardHistoryEntry | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const cents = raw["unit_price_cents"] ?? raw["unitPriceCents"];
  const recorded = raw["recorded_at"] ?? raw["recordedAt"];
  if (!Number.isInteger(cents) || (cents as number) <= 0) {
    return null;
  }
  if (typeof recorded !== "string" || recorded.trim() === "") {
    return null;
  }
  return { unitPriceCents: cents as number, recordedAt: recorded };
}

export function parsePriceHistory(value: unknown): RateCardHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: RateCardHistoryEntry[] = [];
  for (const item of value) {
    const parsed = parseHistoryEntry(item);
    if (parsed) {
      entries.push(parsed);
    }
  }
  return entries;
}

export function appendPriceHistory(
  existing: unknown,
  unitPriceCents: number,
  recordedAtIso: string,
  cap = RATE_CARD_HISTORY_CAP,
): RateCardHistoryEntry[] {
  const next = [
    ...parsePriceHistory(existing),
    { unitPriceCents, recordedAt: recordedAtIso },
  ];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export function historyToJsonb(entries: RateCardHistoryEntry[]): string {
  return JSON.stringify(
    entries.map((entry) => ({
      unit_price_cents: entry.unitPriceCents,
      recorded_at: entry.recordedAt,
    })),
  );
}

export function rateCardRowToResponse(row: RateCardRow): RateCardEntryResponse {
  const source: RateCardSource =
    row.source === "confirmed" || row.source === "imported" ? row.source : "typed";
  return {
    id: row.id,
    normalizedName: row.normalized_name,
    displayName: row.display_name,
    unit: parseCatalogUnit(row.unit) ?? row.unit,
    trade: row.trade,
    unitPriceCents: row.unit_price_cents,
    useCount: row.use_count,
    source,
    priceHistory: parsePriceHistory(row.price_history),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function parseRateCardUpsertBody(body: unknown): ParsedRateCardUpsert {
  const raw = asBodyObject(body);

  if (typeof raw.name !== "string") {
    return { ok: false, error: "name is required and must be a non-empty string" };
  }
  const displayName = displayRateCardName(raw.name);
  const normalizedName = normalizeRateCardName(raw.name);
  if (displayName === "" || normalizedName === "") {
    return { ok: false, error: "name is required and must be a non-empty string" };
  }
  if (displayName.length > 200 || normalizedName.length > 200) {
    return { ok: false, error: "name must be at most 200 characters" };
  }

  const unit = parseCatalogUnit(raw.unit);
  if (!unit) {
    return { ok: false, error: catalogUnitErrorMessage() };
  }

  if (!Number.isInteger(raw.unitPriceCents) || (raw.unitPriceCents as number) <= 0) {
    return { ok: false, error: "unitPriceCents must be an integer greater than 0" };
  }

  const source = parseSource(raw.source);
  if (!source.ok) {
    return source;
  }

  const trade = normalizeTradeCategory(raw.trade);
  return {
    ok: true,
    displayName,
    normalizedName,
    unit,
    trade,
    tradeKey: rateCardTradeKey(trade),
    unitPriceCents: raw.unitPriceCents as number,
    source: source.source,
  };
}

export function parseRateCardLookupQuery(query: {
  name?: unknown;
  unit?: unknown;
  trade?: unknown;
}): ParsedRateCardLookup {
  const nameValue = queryValue(query.name);
  const unitValue = queryValue(query.unit);

  if (typeof nameValue !== "string" || normalizeRateCardName(nameValue) === "") {
    return { ok: false, error: "name is required and must be a non-empty string" };
  }
  const unit = parseCatalogUnit(unitValue);
  if (!unit) {
    return { ok: false, error: catalogUnitErrorMessage() };
  }

  const trade = normalizeTradeCategory(queryValue(query.trade));
  return {
    ok: true,
    normalizedName: normalizeRateCardName(nameValue),
    unit,
    tradeKey: rateCardTradeKey(trade),
  };
}

export async function lookupRateCardEntry(
  queryFn: RateCardQueryFn,
  args: { contractorId: string; query: { name?: unknown; unit?: unknown; trade?: unknown } },
): Promise<RateCardLookupOutcome> {
  const parsed = parseRateCardLookupQuery(args.query);
  if (!parsed.ok) {
    return { status: 400, json: { error: parsed.error } };
  }

  const result = await queryFn(SELECT_RATE_CARD_BY_KEY_SQL, [
    args.contractorId,
    parsed.normalizedName,
    parsed.unit,
    parsed.tradeKey,
  ]);
  if (result.rows.length === 0) {
    return { status: 200, json: { entry: null } };
  }
  return {
    status: 200,
    json: { entry: rateCardRowToResponse(result.rows[0] as RateCardRow) },
  };
}

export async function upsertRateCardEntry(
  queryFn: RateCardQueryFn,
  args: { contractorId: string; body: unknown; recordedAtIso?: string },
): Promise<RateCardUpsertOutcome> {
  const parsed = parseRateCardUpsertBody(args.body);
  if (!parsed.ok) {
    return { status: 400, json: { error: parsed.error } };
  }

  const recordedAtIso = args.recordedAtIso ?? new Date().toISOString();
  const existing = await queryFn(SELECT_RATE_CARD_BY_KEY_SQL, [
    args.contractorId,
    parsed.normalizedName,
    parsed.unit,
    parsed.tradeKey,
  ]);

  if (existing.rows.length === 0) {
    const history = appendPriceHistory([], parsed.unitPriceCents, recordedAtIso);
    const inserted = await queryFn(INSERT_RATE_CARD_SQL, [
      args.contractorId,
      parsed.normalizedName,
      parsed.displayName,
      parsed.unit,
      parsed.trade,
      parsed.unitPriceCents,
      parsed.source,
      historyToJsonb(history),
    ]);
    return {
      status: 200,
      json: { entry: rateCardRowToResponse(inserted.rows[0] as RateCardRow) },
    };
  }

  const current = existing.rows[0] as RateCardRow;
  const history = appendPriceHistory(
    current.price_history,
    parsed.unitPriceCents,
    recordedAtIso,
  );
  const updated = await queryFn(UPDATE_RATE_CARD_SQL, [
    parsed.displayName,
    parsed.unitPriceCents,
    parsed.source,
    historyToJsonb(history),
    current.id,
    args.contractorId,
  ]);
  if (updated.rows.length === 0) {
    return { status: 400, json: { error: "Rate card entry not found" } };
  }
  return {
    status: 200,
    json: { entry: rateCardRowToResponse(updated.rows[0] as RateCardRow) },
  };
}
