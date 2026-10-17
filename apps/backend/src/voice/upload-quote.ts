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
 *
 * A sent, approved, declined, expired, or failed_send quote is not a voice
 * target. Re-uploading it returns 409 and leaves the row alone. Migration
 * 031 rejects the status change if the row freezes after the read.
 */

import { quoteLifecycleConflict, QUOTE_STATUS_LOCKED_ERROR } from "../quotes/lifecycle-error.js";
import { isFrozenQuoteStatus } from "../quotes/statuses.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESET_OWNED_QUOTE_FOR_VOICE_SQL =
  `UPDATE quotes SET status = 'ai_processing', ai_failure_stage = NULL, voice_job_id = NULL WHERE id = $1 AND contractor_id = $2`;

export type VoiceUploadQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export type ParseQuoteServerIdResult =
  | { ok: true; quoteServerId: string | null }
  | { ok: false; error: string };

export type ResolveVoiceUploadQuoteResult =
  | {
      ok: true;
      quoteId: string;
      created: boolean;
      replayJobId?: string;
      /** Previous pg-boss id cleared by this upload. The route cancels it. */
      supersededJobId?: string;
    }
  | { ok: false; status: 404 | 400 | 409; error: string };

function storedJobId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

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

type OwnedVoiceQuoteRow = {
  id: string;
  status?: string;
  voice_job_id?: string | null;
};

function voiceUploadLocked(status: unknown): { ok: false; status: 409; error: string } | null {
  if (typeof status === "string" && isFrozenQuoteStatus(status)) {
    return { ok: false, status: 409, error: QUOTE_STATUS_LOCKED_ERROR };
  }
  return null;
}

/**
 * Pull an owned quote back into the voice pipeline. A sent (or otherwise
 * frozen) quote is refused before the UPDATE. If the row freezes between
 * the read and the write, migration 031 rejects the statement and that
 * becomes the same 409.
 */
async function resetOwnedQuoteForVoice(
  runQuery: VoiceUploadQueryFn,
  contractorId: string,
  row: OwnedVoiceQuoteRow,
): Promise<{ ok: false; status: 409; error: string } | null> {
  const locked = voiceUploadLocked(row.status);
  if (locked) return locked;
  try {
    await runQuery(RESET_OWNED_QUOTE_FOR_VOICE_SQL, [row.id, contractorId]);
  } catch (err) {
    const conflict = quoteLifecycleConflict(err);
    if (conflict) return { ok: false, status: 409, error: conflict };
    throw err;
  }
  return null;
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
      const row = existing.rows[0] as OwnedVoiceQuoteRow | undefined;
      if (row?.id) {
        const locked = voiceUploadLocked(row.status);
        if (locked) return locked;
        const jobId = storedJobId(row.voice_job_id);
        if (jobId !== "" && row.status !== "ai_failed") {
          return { ok: true, quoteId: row.id, created: false, replayJobId: jobId };
        }
        const blocked = await resetOwnedQuoteForVoice(runQuery, contractorId, row);
        if (blocked) return blocked;
        return {
          ok: true,
          quoteId: row.id,
          created: false,
          ...(jobId !== "" ? { supersededJobId: jobId } : {}),
        };
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
    const racedRow = raced.rows[0] as OwnedVoiceQuoteRow | undefined;
    if (!racedRow?.id) {
      throw new Error("quote client_key conflict did not return the existing row");
    }
    const racedLocked = voiceUploadLocked(racedRow.status);
    if (racedLocked) return racedLocked;
    const racedJob = storedJobId(racedRow.voice_job_id);
    if (racedJob !== "" && racedRow.status !== "ai_failed") {
      return { ok: true, quoteId: racedRow.id, created: false, replayJobId: racedJob };
    }
    return { ok: true, quoteId: racedRow.id, created: false };
  }

  const existing = await runQuery(
    `SELECT id, status, voice_job_id FROM quotes WHERE id = $1 AND contractor_id = $2`,
    [quoteServerId, contractorId],
  );
  const row = existing.rows[0] as OwnedVoiceQuoteRow | undefined;
  if (!row) {
    return { ok: false, status: 404, error: "Quote not found" };
  }

  const blocked = await resetOwnedQuoteForVoice(runQuery, contractorId, row);
  if (blocked) return blocked;

  const previousJobId = storedJobId(row.voice_job_id);

  return {
    ok: true,
    quoteId: quoteServerId,
    created: false,
    ...(previousJobId !== "" ? { supersededJobId: previousJobId } : {}),
  };
}
