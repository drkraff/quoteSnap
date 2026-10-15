import type { FeedbackBody } from "./validate.js";

export type FeedbackQuery = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export const INSERT_FEEDBACK_SQL = `
INSERT INTO feedback (
  contractor_id, message, rating, screen, quote_id, app_version, platform, screenshot
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, created_at
`;

export type InsertFeedbackResult = {
  status: 201;
  json: { id: string; createdAt: string };
};

function createdAtIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date(0).toISOString();
}

/**
 * Stores one note for the authenticated contractor. contractor_id is the JWT
 * id passed in, never a field from the body.
 */
export async function insertFeedback(
  query: FeedbackQuery,
  contractorId: string,
  body: FeedbackBody,
): Promise<InsertFeedbackResult> {
  const result = await query(INSERT_FEEDBACK_SQL, [
    contractorId,
    body.message,
    body.rating,
    body.screen,
    body.quoteId,
    body.appVersion,
    body.platform,
    body.screenshot,
  ]);
  const row = result.rows[0] as { id?: unknown; created_at?: unknown } | undefined;
  if (typeof row?.id !== "string" || row.id.length === 0) {
    throw new Error("feedback insert returned no id");
  }
  return {
    status: 201,
    json: { id: row.id, createdAt: createdAtIso(row.created_at) },
  };
}
