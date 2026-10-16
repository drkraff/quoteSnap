import type { FeedbackQuery } from "./submit.js";

export const FEEDBACK_LIST_DEFAULT_LIMIT = 20;
export const FEEDBACK_LIST_MAX_LIMIT = 50;
export const FEEDBACK_LIST_MAX_OFFSET = 10_000;

export const LIST_FEEDBACK_SQL = `
SELECT id, contractor_id, message, rating, screen, quote_id, app_version, platform,
       screenshot, created_at
FROM feedback
ORDER BY created_at DESC, id DESC
LIMIT $1 OFFSET $2
`;

export type FeedbackListItem = {
  id: string;
  contractorId: string;
  message: string;
  rating: number | null;
  screen: string | null;
  quoteId: string | null;
  appVersion: string | null;
  platform: string | null;
  screenshotBase64: string | null;
  createdAt: string;
};

export type ListFeedbackResult =
  | { status: 200; json: { feedback: FeedbackListItem[]; limit: number; offset: number } }
  | { status: 400; json: { error: string } };

function pageInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  name: string,
): { ok: true; value: number } | { ok: false; error: string } {
  if (value === undefined || value === "") return { ok: true, value: fallback };
  if (Array.isArray(value)) return { ok: false, error: `${name} must be a whole number` };
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { ok: false, error: `${name} must be a whole number` };
  }
  return { ok: true, value: parsed };
}

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableRating(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

function screenshotBase64(value: unknown): string | null {
  if (value == null) return null;
  const bytes = Buffer.isBuffer(value)
    ? value
    : value instanceof Uint8Array
      ? Buffer.from(value)
      : null;
  if (!bytes || bytes.length === 0) return null;
  return bytes.toString("base64");
}

function createdAtIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date(0).toISOString();
}

export function parseFeedbackListQuery(query: {
  limit?: unknown;
  offset?: unknown;
}): { ok: true; limit: number; offset: number } | { ok: false; error: string } {
  const limit = pageInt(query.limit, FEEDBACK_LIST_DEFAULT_LIMIT, 1, FEEDBACK_LIST_MAX_LIMIT, "limit");
  if (!limit.ok) return limit;
  const offset = pageInt(query.offset, 0, 0, FEEDBACK_LIST_MAX_OFFSET, "offset");
  if (!offset.ok) return offset;
  return { ok: true, limit: limit.value, offset: offset.value };
}

export function feedbackRowToJson(row: Record<string, unknown>): FeedbackListItem {
  return {
    id: typeof row["id"] === "string" ? row["id"] : "",
    contractorId: typeof row["contractor_id"] === "string" ? row["contractor_id"] : "",
    message: typeof row["message"] === "string" ? row["message"] : "",
    rating: nullableRating(row["rating"]),
    screen: nullableString(row["screen"]),
    quoteId: nullableString(row["quote_id"]),
    appVersion: nullableString(row["app_version"]),
    platform: nullableString(row["platform"]),
    screenshotBase64: screenshotBase64(row["screenshot"]),
    createdAt: createdAtIso(row["created_at"]),
  };
}

export async function listFeedback(
  query: FeedbackQuery,
  rawQuery: { limit?: unknown; offset?: unknown },
): Promise<ListFeedbackResult> {
  const page = parseFeedbackListQuery(rawQuery);
  if (!page.ok) return { status: 400, json: { error: page.error } };
  const result = await query(LIST_FEEDBACK_SQL, [page.limit, page.offset]);
  const feedback = result.rows.map((row) => feedbackRowToJson(row as Record<string, unknown>));
  return {
    status: 200,
    json: { feedback, limit: page.limit, offset: page.offset },
  };
}
