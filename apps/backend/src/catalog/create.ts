import { parseCatalogUnit } from "./units.js";

/** Same shape as `QueryFn` without importing `connection.ts` (needs DATABASE_URL). */
export type CatalogCreateQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export const INSERT_CATALOG_ITEM_SQL = `INSERT INTO catalog_items (contractor_id, name, unit, unit_price_cents, trade_category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, unit, unit_price_cents, trade_category, is_archived, created_at, updated_at`;

export type CatalogCreateFields = {
  name: string;
  unit: string;
  unitPriceCents: number;
  tradeCategory?: unknown;
};

/**
 * Empty / omitted tradeCategory becomes NULL. Non-empty strings are trimmed
 * so POST /catalog stores the contractor trade (A-15) instead of dropping it.
 */
export function normalizeTradeCategory(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function catalogCreateInsertParams(
  contractorId: string,
  fields: CatalogCreateFields,
): [string, string, string, number, string | null] {
  return [
    contractorId,
    fields.name.trim(),
    fields.unit,
    fields.unitPriceCents,
    normalizeTradeCategory(fields.tradeCategory),
  ];
}

export async function insertCatalogItem(
  query: CatalogCreateQueryFn,
  contractorId: string,
  fields: CatalogCreateFields,
): Promise<unknown> {
  const unit = parseCatalogUnit(fields.unit);
  if (!unit) {
    throw new Error("insertCatalogItem requires a canonical catalog unit");
  }
  const result = await query(
    INSERT_CATALOG_ITEM_SQL,
    catalogCreateInsertParams(contractorId, { ...fields, unit }),
  );
  return result.rows[0];
}
