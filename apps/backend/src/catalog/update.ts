import { normalizeTradeCategory } from "./create.js";

/**
 * PUT /catalog/:id assignments. `tradeCategory` is only written when the body
 * includes the key — name/unit/price edits must not SET trade_category = NULL (A-15).
 */
export function catalogUpdateAssignments(body: {
  name?: string;
  unit?: string;
  unitPriceCents?: number;
  tradeCategory?: unknown;
}): { setClauses: string[]; params: unknown[] } {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) {
    params.push(body.name);
    setClauses.push(`name = $${params.length}`);
  }
  if (body.unit !== undefined) {
    params.push(body.unit);
    setClauses.push(`unit = $${params.length}`);
  }
  if (body.unitPriceCents !== undefined) {
    params.push(body.unitPriceCents);
    setClauses.push(`unit_price_cents = $${params.length}`);
  }
  if (body.tradeCategory !== undefined) {
    params.push(normalizeTradeCategory(body.tradeCategory));
    setClauses.push(`trade_category = $${params.length}`);
  }

  return { setClauses, params };
}
