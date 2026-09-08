import { parseCatalogUnit, type CatalogUnit } from "../catalog/units.js";
import { TRADE_TEMPLATES } from "../data/trade-templates.js";
import type { SeedResponse, Trade } from "../types/onboarding.js";

/** Same shape as `QueryFn` without importing `connection.ts` (needs DATABASE_URL). */
export type SeedQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export const VALID_TRADES: Trade[] = ["plumbing", "electrical", "hvac"];
const VALID_TRADE_SET: ReadonlySet<string> = new Set(VALID_TRADES);

export const INVALID_TRADE_ERROR =
  "Invalid trade. Must be one of: plumbing, electrical, hvac";

export const ALREADY_SEEDED_ERROR = "Catalog already seeded";

export const SELECT_CONTRACTOR_FOR_UPDATE_SQL =
  "SELECT id, trade FROM contractors WHERE id = $1 FOR UPDATE";

export const UPDATE_CONTRACTOR_TRADE_SQL = `UPDATE contractors
       SET trade = $1
       WHERE id = $2 AND trade IS NULL
       RETURNING id, trade`;

export const INSERT_CATALOG_ITEM_SQL = `INSERT INTO catalog_items (contractor_id, name, unit, unit_price_cents, trade_category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, unit, unit_price_cents, trade_category`;

export type ParsedTrade =
  | { ok: true; trade: Trade }
  | { ok: false; error: string };

export type SeedOutcome =
  | { status: 404 | 409; json: { error: string } }
  | { status: 201; json: SeedResponse };

type ContractorLockRow = { id: string; trade: string | null };

type CatalogSeedRow = {
  id: string;
  name: string;
  unit: string;
  unit_price_cents: number;
  trade_category: string;
};

export function parseTrade(value: unknown): ParsedTrade {
  if (typeof value !== "string" || !VALID_TRADE_SET.has(value)) {
    return { ok: false, error: INVALID_TRADE_ERROR };
  }
  return { ok: true, trade: value as Trade };
}

export function parseSeedBody(body: unknown): ParsedTrade {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: INVALID_TRADE_ERROR };
  }
  return parseTrade((body as { trade?: unknown }).trade);
}

function mapInsertedItem(row: CatalogSeedRow): SeedResponse["items"][number] {
  return {
    id: row.id,
    name: row.name,
    unit: parseCatalogUnit(row.unit) ?? row.unit,
    unitPriceCents: row.unit_price_cents,
    tradeCategory: row.trade_category,
  };
}

function resolvedTemplateItems(trade: Trade): Array<{
  name: string;
  unit: CatalogUnit;
  unitPriceCents: number;
  tradeCategory: string;
}> {
  return TRADE_TEMPLATES[trade].map((item) => {
    const unit = parseCatalogUnit(item.unit);
    if (!unit) {
      throw new Error(`Invalid catalog unit in trade template: ${item.name} (${item.unit})`);
    }
    return {
      name: item.name,
      unit,
      unitPriceCents: item.unitPriceCents,
      tradeCategory: item.tradeCategory,
    };
  });
}

/**
 * Trade update + template catalog inserts on one query function so the caller
 * can wrap this in a single DB transaction (BEGIN/COMMIT/ROLLBACK).
 *
 * After a successful commit, `contractors.trade` set means the catalog is
 * complete — 409 is therefore "already fully seeded". A throw mid-insert
 * must propagate so `withTransaction` rolls back the trade write.
 */
export async function applyOnboardingSeed(
  queryFn: SeedQueryFn,
  args: { contractorId: string; trade: Trade },
): Promise<SeedOutcome> {
  const itemsToInsert = resolvedTemplateItems(args.trade);

  const locked = await queryFn(SELECT_CONTRACTOR_FOR_UPDATE_SQL, [args.contractorId]);
  if (locked.rows.length === 0) {
    return { status: 404, json: { error: "Contractor not found" } };
  }
  const contractor = locked.rows[0] as ContractorLockRow;
  if (contractor.trade) {
    return { status: 409, json: { error: ALREADY_SEEDED_ERROR } };
  }

  const updated = await queryFn(UPDATE_CONTRACTOR_TRADE_SQL, [args.trade, args.contractorId]);
  if (updated.rows.length === 0) {
    return { status: 409, json: { error: ALREADY_SEEDED_ERROR } };
  }

  const insertedItems: SeedResponse["items"] = [];
  for (const item of itemsToInsert) {
    const result = await queryFn(INSERT_CATALOG_ITEM_SQL, [
      args.contractorId,
      item.name,
      item.unit,
      item.unitPriceCents,
      item.tradeCategory,
    ]);
    const row = result.rows[0] as CatalogSeedRow;
    insertedItems.push(mapInsertedItem(row));
  }

  return {
    status: 201,
    json: {
      trade: args.trade,
      itemCount: insertedItems.length,
      items: insertedItems,
    },
  };
}
