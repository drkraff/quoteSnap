import { parseArchivePatchBody } from "../catalog/archive.js";

export type QuoteArchivePatchPlan =
  | { ok: false; status: 400; error: string }
  | { ok: true; archived: boolean; sql: string; params: [string, string] };

export type QuoteArchiveQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export function quoteArchiveUpdateSql(archived: boolean): string {
  if (archived) {
    // Idempotent so a retried queue item does not 404 after a successful archive.
    return `UPDATE quotes
       SET is_archived = TRUE
       WHERE id = $1 AND contractor_id = $2
       RETURNING id`;
  }
  return `UPDATE quotes
       SET is_archived = FALSE
       WHERE id = $1 AND contractor_id = $2
       RETURNING id`;
}

export function planQuoteArchivePatch(
  quoteId: string,
  contractorId: string,
  body: unknown,
): QuoteArchivePatchPlan {
  const parsed = parseArchivePatchBody(body);
  if (!parsed.ok) {
    return { ok: false, status: 400, error: parsed.error };
  }
  return {
    ok: true,
    archived: parsed.archived,
    sql: quoteArchiveUpdateSql(parsed.archived),
    params: [quoteId, contractorId],
  };
}

export async function applyQuoteArchivePatch(
  queryFn: QuoteArchiveQueryFn,
  args: { quoteId: string; contractorId: string; body: unknown },
): Promise<{ status: number; json: { archived: boolean } | { error: string } }> {
  const plan = planQuoteArchivePatch(args.quoteId, args.contractorId, args.body);
  if (!plan.ok) {
    return { status: 400, json: { error: plan.error } };
  }
  const result = await queryFn(plan.sql, plan.params);
  if (result.rows.length === 0) {
    return { status: 404, json: { error: "Quote not found" } };
  }
  return { status: 200, json: { archived: plan.archived } };
}
