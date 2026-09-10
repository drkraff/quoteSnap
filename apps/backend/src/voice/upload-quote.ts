/**
 * POST /voice/upload quote targeting.
 *
 * Mobile may send multipart `quoteServerId` (the server quote UUID from a
 * previous 202, or stamped from a 500 after enqueue). When that id is a
 * tenant-owned UUID, reuse the row instead of INSERT. Absent/blank still
 * creates — first upload of a voice-first local quote.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VoiceUploadQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export type ParseQuoteServerIdResult =
  | { ok: true; quoteServerId: string | null }
  | { ok: false; error: string };

export type ResolveVoiceUploadQuoteResult =
  | { ok: true; quoteId: string; created: boolean }
  | { ok: false; status: 404; error: string };

function firstStringField(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Multipart field `quoteServerId`. Blank/omitted → create. Non-UUID → 400.
 */
export function parseQuoteServerId(raw: unknown): ParseQuoteServerIdResult {
  const value = firstStringField(raw);
  if (value === undefined || value === null) {
    return { ok: true, quoteServerId: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "quoteServerId must be a UUID" };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, quoteServerId: null };
  }
  if (!UUID_RE.test(trimmed)) {
    return { ok: false, error: "quoteServerId must be a UUID" };
  }
  return { ok: true, quoteServerId: trimmed };
}

/**
 * Reuse a contractor-owned quote, or INSERT a new ai_processing row.
 */
export async function resolveVoiceUploadQuote(
  runQuery: VoiceUploadQueryFn,
  contractorId: string,
  quoteServerId: string | null,
): Promise<ResolveVoiceUploadQuoteResult> {
  if (quoteServerId === null) {
    const inserted = await runQuery(
      `INSERT INTO quotes (contractor_id, status, total_cents) VALUES ($1, 'ai_processing', 0) RETURNING id`,
      [contractorId],
    );
    const row = inserted.rows[0] as { id: string } | undefined;
    if (!row?.id) {
      throw new Error("INSERT quotes did not return id");
    }
    return { ok: true, quoteId: row.id, created: true };
  }

  const existing = await runQuery(
    `SELECT id FROM quotes WHERE id = $1 AND contractor_id = $2`,
    [quoteServerId, contractorId],
  );
  if (existing.rows.length === 0) {
    return { ok: false, status: 404, error: "Quote not found" };
  }

  await runQuery(
    `UPDATE quotes SET status = 'ai_processing' WHERE id = $1 AND contractor_id = $2`,
    [quoteServerId, contractorId],
  );

  return { ok: true, quoteId: quoteServerId, created: false };
}
