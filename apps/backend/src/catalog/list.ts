/** Active catalog list (GET /catalog). Soft-archived rows stay in Postgres. */
export const LIST_ACTIVE_CATALOG_SQL = `SELECT id, name, unit, unit_price_cents, trade_category, is_archived, created_at, updated_at
       FROM catalog_items
       WHERE contractor_id = $1 AND is_archived = FALSE
       ORDER BY trade_category ASC NULLS LAST, name ASC`;
