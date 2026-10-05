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

export const CATALOG_CLIENT_KEY_MAX_LENGTH = 64;

export const INSERT_CATALOG_ITEM_CLIENT_KEY_SQL = `INSERT INTO catalog_items (contractor_id, name, unit, unit_price_cents, trade_category, client_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (contractor_id, client_key) WHERE client_key IS NOT NULL
       DO NOTHING
       RETURNING id, name, unit, unit_price_cents, trade_category, is_archived, created_at, updated_at`;

export const SELECT_CATALOG_BY_CLIENT_KEY_SQL = `SELECT id, name, unit, unit_price_cents, trade_category, is_archived, created_at, updated_at
       FROM catalog_items
       WHERE contractor_id = $1 AND client_key = $2`;

const CATALOG_CLIENT_KEY_ERROR = `clientKey must be a string of at most ${CATALOG_CLIENT_KEY_MAX_LENGTH} characters`;

export function parseCatalogClientKey(
  value: unknown,
): { ok: true; clientKey: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, clientKey: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: CATALOG_CLIENT_KEY_ERROR };
  }
  const clientKey = value.trim();
  if (clientKey.length === 0) {
    return { ok: true, clientKey: null };
  }
  if (clientKey.length > CATALOG_CLIENT_KEY_MAX_LENGTH) {
    return { ok: false, error: CATALOG_CLIENT_KEY_ERROR };
  }
  return { ok: true, clientKey };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object"
    && err !== null
    && "code" in err
    && (err as { code: unknown }).code === "23505"
  );
}

/**
 * Insert a catalog SKU, or return the row already stored for this contractor
 * and client key. A retry does not change the original cents.
 */
export async function insertCatalogItemIdempotent(
  query: CatalogCreateQueryFn,
  contractorId: string,
  fields: CatalogCreateFields & { clientKey: string },
): Promise<{ created: boolean; row: unknown }> {
  const unit = parseCatalogUnit(fields.unit);
  if (!unit) {
    throw new Error("insertCatalogItem requires a canonical catalog unit");
  }
  const base = catalogCreateInsertParams(contractorId, { ...fields, unit });
  let inserted: unknown;
  try {
    const result = await query(INSERT_CATALOG_ITEM_CLIENT_KEY_SQL, [...base, fields.clientKey]);
    inserted = result.rows[0];
  } catch (err) {
    if (!isUniqueViolation(err)) {
      throw err;
    }
  }
  if (inserted) {
    return { created: true, row: inserted };
  }
  const existing = await query(SELECT_CATALOG_BY_CLIENT_KEY_SQL, [contractorId, fields.clientKey]);
  const row = existing.rows[0];
  if (!row) {
    throw new Error("catalog client_key conflict did not return the existing row");
  }
  return { created: false, row };
}
