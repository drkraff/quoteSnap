/**
 * A voice job may write only while it is still the quote's stored job and the
 * quote is still in the voice pipeline. `voice_job_id` is the per-draft
 * request generation: re-record stores a new id and the previous job is stale.
 */

export type VoiceJobQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export type VoiceJobGate = "current" | "unassigned" | "stale";

export const READ_VOICE_JOB_GATE_SQL = `SELECT status, voice_job_id FROM quotes WHERE id = $1`;

/**
 * Same-job pg-boss retry. A newer recording has a different voice_job_id, so
 * this does not reopen a sent quote or a draft that a later job already wrote.
 */
export const REOPEN_VOICE_ATTEMPT_SQL = `UPDATE quotes
   SET status = 'ai_processing', ai_failure_stage = NULL
 WHERE id = $1
   AND voice_job_id = $2
   AND status = 'ai_failed'`;

type VoiceJobRow = {
  status?: unknown;
  voice_job_id?: unknown;
};

function storedJobId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPipelineStatus(status: unknown): boolean {
  return status === "ai_processing" || status === "ai_failed";
}

/**
 * `unassigned` is the short window after enqueue and before voice_job_id is
 * stored. The commit still requires the id. Any other id, or a status outside
 * the voice pipeline, is stale and must be discarded.
 */
export async function readVoiceJobGate(
  runQuery: VoiceJobQueryFn,
  quoteId: string,
  jobId: string,
): Promise<VoiceJobGate> {
  const result = await runQuery(READ_VOICE_JOB_GATE_SQL, [quoteId]);
  const row = result.rows[0] as VoiceJobRow | undefined;
  if (!row || !isPipelineStatus(row.status)) return "stale";
  const stored = storedJobId(row.voice_job_id);
  if (stored === "") return "unassigned";
  return stored === jobId.trim() ? "current" : "stale";
}

export async function reopenCurrentVoiceAttempt(
  runQuery: VoiceJobQueryFn,
  quoteId: string,
  jobId: string,
): Promise<void> {
  const id = jobId.trim();
  if (id === "") return;
  await runQuery(REOPEN_VOICE_ATTEMPT_SQL, [quoteId, id]);
}
