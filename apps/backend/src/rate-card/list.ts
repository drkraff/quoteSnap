import type { RateCardListResponse } from "../types/rate-card.js";
import {
  RATE_CARD_COLUMNS,
  rateCardRowToResponse,
  type RateCardQueryFn,
  type RateCardRow,
} from "./upsert.js";

export const RATE_CARD_LIST_DEFAULT_LIMIT = 100;
export const RATE_CARD_LIST_MAX_LIMIT = 200;

export const SELECT_RATE_CARD_LIST_SQL = `SELECT ${RATE_CARD_COLUMNS}
       FROM rate_card_entries
       WHERE contractor_id = $1
       ORDER BY normalized_name ASC, unit ASC, trade_key ASC
       LIMIT $2 OFFSET $3`;

export const COUNT_RATE_CARD_LIST_SQL = `SELECT COUNT(*)::int AS total
       FROM rate_card_entries
       WHERE contractor_id = $1`;

export const DELETE_RATE_CARD_SQL = `DELETE FROM rate_card_entries
       WHERE id = $1 AND contractor_id = $2
       RETURNING id`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type { RateCardListResponse };

export type RateCardListOutcome =
  | { status: 400; json: { error: string } }
  | { status: 200; json: RateCardListResponse };

export type RateCardDeleteOutcome =
  | { status: 400; json: { error: string } }
  | { status: 404; json: { error: string } }
  | { status: 200; json: { deleted: true } };

export type ParsedRateCardListQuery =
  | { ok: false; error: string }
  | { ok: true; limit: number; offset: number };

function queryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function parseIntParam(value: unknown): number | undefined | "invalid" {
  const raw = queryValue(value);
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  if (typeof raw === "number" && Number.isInteger(raw)) {
    return raw;
  }
  if (typeof raw === "string" && /^-?\d+$/.test(raw)) {
    return Number(raw);
  }
  return "invalid";
}

/** Exact lookup when `name` is present; omit `name` for the contractor list. */
export function isRateCardExactLookupQuery(query: { name?: unknown }): boolean {
  return query.name !== undefined;
}

export function parseRateCardListQuery(query: {
  limit?: unknown;
  offset?: unknown;
}): ParsedRateCardListQuery {
  const limitRaw = parseIntParam(query.limit);
  if (limitRaw === "invalid") {
    return {
      ok: false,
      error: `limit must be an integer between 1 and ${RATE_CARD_LIST_MAX_LIMIT}`,
    };
  }
  const limit = limitRaw ?? RATE_CARD_LIST_DEFAULT_LIMIT;
  if (limit < 1 || limit > RATE_CARD_LIST_MAX_LIMIT) {
    return {
      ok: false,
      error: `limit must be an integer between 1 and ${RATE_CARD_LIST_MAX_LIMIT}`,
    };
  }

  const offsetRaw = parseIntParam(query.offset);
  if (offsetRaw === "invalid") {
    return { ok: false, error: "offset must be an integer of 0 or more" };
  }
  const offset = offsetRaw ?? 0;
  if (offset < 0) {
    return { ok: false, error: "offset must be an integer of 0 or more" };
  }

  return { ok: true, limit, offset };
}

export async function listRateCardEntries(
  queryFn: RateCardQueryFn,
  args: {
    contractorId: string;
    query: { limit?: unknown; offset?: unknown };
  },
): Promise<RateCardListOutcome> {
  const parsed = parseRateCardListQuery(args.query);
  if (!parsed.ok) {
    return { status: 400, json: { error: parsed.error } };
  }

  const count = await queryFn(COUNT_RATE_CARD_LIST_SQL, [args.contractorId]);
  const total = Number((count.rows[0] as { total?: unknown } | undefined)?.total ?? 0);
  const result = await queryFn(SELECT_RATE_CARD_LIST_SQL, [
    args.contractorId,
    parsed.limit,
    parsed.offset,
  ]);

  return {
    status: 200,
    json: {
      entries: (result.rows as RateCardRow[]).map(rateCardRowToResponse),
      limit: parsed.limit,
      offset: parsed.offset,
      total,
    },
  };
}

export async function deleteRateCardEntry(
  queryFn: RateCardQueryFn,
  args: { contractorId: string; id: string },
): Promise<RateCardDeleteOutcome> {
  if (!UUID_RE.test(args.id)) {
    return { status: 400, json: { error: "id must be a UUID" } };
  }

  const result = await queryFn(DELETE_RATE_CARD_SQL, [args.id, args.contractorId]);
  if (result.rows.length === 0) {
    return { status: 404, json: { error: "Rate card entry not found" } };
  }
  return { status: 200, json: { deleted: true } };
}
