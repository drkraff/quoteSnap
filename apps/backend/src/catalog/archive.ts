export type ArchivePatchParseResult =
  | { ok: true; archived: boolean }
  | { ok: false; error: string };

export type ArchivePatchPlan =
  | { ok: false; status: 400; error: string }
  | { ok: true; archived: boolean; sql: string; params: [string, string] };

export type ArchiveQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

/**
 * PATCH /catalog/:id/archive body.
 * Omitted / empty body keeps the existing one-way archive client (no JSON).
 * `{ archived: false }` is undo-unarchive (A-05).
 */
export function parseArchivePatchBody(body: unknown): ArchivePatchParseResult {
  if (body == null) {
    return { ok: true, archived: true };
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "archived must be a boolean" };
  }
  if (!("archived" in body) || body.archived === undefined) {
    return { ok: true, archived: true };
  }
  if (typeof body.archived !== "boolean") {
    return { ok: false, error: "archived must be a boolean" };
  }
  return { ok: true, archived: body.archived };
}

export function catalogArchiveUpdateSql(archived: boolean): string {
  if (archived) {
    // Existing archive: only an active, tenant-owned row.
    return `UPDATE catalog_items
       SET is_archived = TRUE
       WHERE id = $1 AND contractor_id = $2 AND is_archived = FALSE
       RETURNING id`;
  }
  // Unarchive is idempotent so a retried undo does not 404 after success.
  return `UPDATE catalog_items
       SET is_archived = FALSE
       WHERE id = $1 AND contractor_id = $2
       RETURNING id`;
}

export function planArchivePatch(
  itemId: string,
  contractorId: string,
  body: unknown,
): ArchivePatchPlan {
  const parsed = parseArchivePatchBody(body);
  if (!parsed.ok) {
    return { ok: false, status: 400, error: parsed.error };
  }
  return {
    ok: true,
    archived: parsed.archived,
    sql: catalogArchiveUpdateSql(parsed.archived),
    params: [itemId, contractorId],
  };
}

export async function applyCatalogArchivePatch(
  queryFn: ArchiveQueryFn,
  args: { itemId: string; contractorId: string; body: unknown },
): Promise<{ status: number; json: { archived: boolean } | { error: string } }> {
  const plan = planArchivePatch(args.itemId, args.contractorId, args.body);
  if (!plan.ok) {
    return { status: 400, json: { error: plan.error } };
  }
  const result = await queryFn(plan.sql, plan.params);
  if (result.rows.length === 0) {
    return { status: 404, json: { error: "Item not found" } };
  }
  return { status: 200, json: { archived: plan.archived } };
}
