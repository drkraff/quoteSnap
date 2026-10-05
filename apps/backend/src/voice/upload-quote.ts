/**
 * POST /voice/upload quote targeting.
 *
 * Mobile may send multipart `quoteServerId` (the server quote UUID from a
 * previous 202, or stamped from a 500 after enqueue). When that id is a
 * tenant-owned UUID, reuse the row instead of INSERT. Absent/blank still
 * creates — first upload of a voice-first local quote.
 *
 * FAIL-04 retry reuses the same row: reset to ai_processing, clear the old
 * voice_job_id so the poller does not latch onto a failed job, and clear
 * ai_failure_stage until the new worker run finishes.
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
  | { ok: true; quoteId: string; created: boolean; replayJobId?: string }
  | { ok: false; status: 404 | 400; error: string };

const CLIENT_KEY_MAX_LENGTH = 64;
const CLIENT_KEY_ERROR = `clientKey must be a string of at most ${CLIENT_KEY_MAX_LENGTH} characters`;

/**
 * Multipart field `clientKey` (local quote id). Blank/omitted → insert without a key.
 */
export function parseVoiceClientKey(raw: unknown): { ok: true; clientKey: string | null } | { ok: false; error: string } {
  const value = firstStringField(raw);
  if (value === undefined || value === null) {
    return { ok: true, clientKey: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: CLIENT_KEY_ERROR };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, clientKey: null };
  }
  if (trimmed.length > CLIENT_KEY_MAX_LENGTH) {
    return { ok: false, error: CLIENT_KEY_ERROR };
  }
  return { ok: true, clientKey: trimmed };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object"
    && err !== null
    && "code" in err
    && (err as { code: unknown }).code === "23505"
  );
}

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
  clientKey: string | null = null,
): Promise<ResolveVoiceUploadQuoteResult> {
  if (quoteServerId === null) {
    if (clientKey) {
      const existing = await runQuery(
        `SELECT id, status, voice_job_id FROM quotes WHERE contractor_id = $1 AND client_key = $2`,
        [contractorId, clientKey],
      );
      const row = existing.rows[0] as { id: string; status: string; voice_job_id: string | null } | undefined;
      if (row?.id) {
        const jobId = typeof row.voice_job_id === "string" ? row.voice_job_id.trim() : "";
        if (jobId !== "" && row.status !== "ai_failed") {
          return { ok: true, quoteId: row.id, created: false, replayJobId: jobId };
        }
        await runQuery(
          `UPDATE quotes SET status = 'ai_processing', ai_failure_stage = NULL, voice_job_id = NULL WHERE id = $1 AND contractor_id = $2`,
          [row.id, contractorId],
        );
        return { ok: true, quoteId: row.id, created: false };
      }
    }

    let insertedId: string | undefined;
    try {
      const inserted = await runQuery(
        clientKey
          ? `INSERT INTO quotes (contractor_id, status, total_cents, client_key) VALUES ($1, 'ai_processing', 0, $2)
             ON CONFLICT (contractor_id, client_key) WHERE client_key IS NOT NULL
             DO NOTHING
             RETURNING id`
          : `INSERT INTO quotes (contractor_id, status, total_cents) VALUES ($1, 'ai_processing', 0) RETURNING id`,
        clientKey ? [contractorId, clientKey] : [contractorId],
      );
      insertedId = (inserted.rows[0] as { id: string } | undefined)?.id;
    } catch (err) {
      if (!clientKey || !isUniqueViolation(err)) {
        throw err;
      }
    }
    if (insertedId) {
      return { ok: true, quoteId: insertedId, created: true };
    }
    if (!clientKey) {
      throw new Error("INSERT quotes did not return id");
    }
    const raced = await runQuery(
      `SELECT id, status, voice_job_id FROM quotes WHERE contractor_id = $1 AND client_key = $2`,
      [contractorId, clientKey],
    );
    const racedRow = raced.rows[0] as { id: string; status: string; voice_job_id: string | null } | undefined;
    if (!racedRow?.id) {
      throw new Error("quote client_key conflict did not return the existing row");
    }
    const racedJob = typeof racedRow.voice_job_id === "string" ? racedRow.voice_job_id.trim() : "";
    if (racedJob !== "" && racedRow.status !== "ai_failed") {
      return { ok: true, quoteId: racedRow.id, created: false, replayJobId: racedJob };
    }
    return { ok: true, quoteId: racedRow.id, created: false };
  }

  const existing = await runQuery(
    `SELECT id FROM quotes WHERE id = $1 AND contractor_id = $2`,
    [quoteServerId, contractorId],
  );
  if (existing.rows.length === 0) {
    return { ok: false, status: 404, error: "Quote not found" };
  }

  await runQuery(
    `UPDATE quotes SET status = 'ai_processing', ai_failure_stage = NULL, voice_job_id = NULL WHERE id = $1 AND contractor_id = $2`,
    [quoteServerId, contractorId],
  );

  return { ok: true, quoteId: quoteServerId, created: false };
}
