import { randomUUID } from "node:crypto";
import {
  inferSnapshotPriceSource,
  isSnapshotPriceSource,
  type SnapshotPriceSource,
} from "../quotes/price-source.js";
import { isUuid } from "../uuid.js";
import { snapshotUnitPriceCents } from "../workers/voice-price-attach.js";
import type { AiFailureStage } from "./ai-failure.js";

export type VoiceCommitClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

export type VoiceCommitLine = {
  catalogItemId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  unitPriceCents: number | null;
  confidence: number;
  priceSource?: SnapshotPriceSource | string | null;
  roomId?: string | null;
  clientId?: string | null;
};

export const DELETE_VOICE_LINE_ITEMS_SQL = `DELETE FROM quote_line_items WHERE quote_id = $1`;

export const INSERT_VOICE_LINE_ITEM_SQL = `INSERT INTO quote_line_items (quote_id, catalog_item_id, name, quantity, unit_price_cents, confidence, unit, price_source, room_id, client_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

/**
 * Per-draft request version. `voice_job_id` is the generation: a re-record
 * stores a new id, and a commit from the previous id must not run.
 * Only the voice pipeline may be written. `sent` and `draft_local` are not
 * in this list, so a late job cannot unlock a sent quote or replace a newer draft.
 */
export const LOCK_CURRENT_VOICE_JOB_SQL = `SELECT id FROM quotes WHERE id = $1 AND voice_job_id = $2 AND status = 'ai_processing' FOR UPDATE`;

function commitPriceSource(item: VoiceCommitLine): SnapshotPriceSource {
  const cents = snapshotUnitPriceCents(item.unitPriceCents);
  if (isSnapshotPriceSource(item.priceSource)) {
    return item.priceSource;
  }
  return inferSnapshotPriceSource(cents);
}

export const UPDATE_VOICE_QUOTE_RESULT_SQL = `UPDATE quotes SET status = $1, total_cents = $2, ai_failure_stage = $3, client_sentence = COALESCE($4, client_sentence), exclusions = COALESCE($5, exclusions), rooms = COALESCE($6::jsonb, rooms) WHERE id = $7 AND voice_job_id = $8 AND status = 'ai_processing'`;

type VoiceLockResult = { rows?: unknown[] };

/**
 * Replace line items and set quote status in the caller's transaction.
 * Used for a successful draft_local commit and for FAIL-05 partial ai_failed.
 *
 * Returns false when this job is no longer the stored voice job, or the quote
 * is no longer `ai_processing`. The caller must not delete lines in that case.
 * The lock and the update share the same predicate so a re-record that commits
 * first cannot lose its lines to this job.
 */
export async function replaceVoiceQuoteLines(
  client: VoiceCommitClient,
  args: {
    quoteId: string;
    /** pg-boss id stored on the quote. This is the request generation. */
    jobId: string;
    lineItems: VoiceCommitLine[];
    status: "draft_local" | "ai_failed";
    totalCents: number;
    failureStage: AiFailureStage | null;
    /** Job description. Null leaves the existing note. */
    clientSentence?: string | null;
    /** Spoken exclusions for Not included. Null leaves the existing column. */
    exclusions?: string | null;
    /** Extracted rooms. Null leaves the existing column. */
    roomsJson?: string | null;
  },
): Promise<boolean> {
  const jobId = args.jobId.trim();
  if (jobId === "") return false;
  const locked = (await client.query(LOCK_CURRENT_VOICE_JOB_SQL, [args.quoteId, jobId])) as
    | VoiceLockResult
    | undefined;
  const lockedRows = locked && Array.isArray(locked.rows) ? locked.rows : [];
  if (lockedRows.length === 0) return false;
  await client.query(DELETE_VOICE_LINE_ITEMS_SQL, [args.quoteId]);
  for (const item of args.lineItems) {
    await client.query(INSERT_VOICE_LINE_ITEM_SQL, [
      args.quoteId,
      item.catalogItemId,
      item.name,
      item.quantity,
      snapshotUnitPriceCents(item.unitPriceCents),
      item.confidence,
      item.unit,
      commitPriceSource(item),
      item.roomId ?? null,
      item.clientId && isUuid(item.clientId) ? item.clientId : randomUUID(),
    ]);
  }
  await client.query(UPDATE_VOICE_QUOTE_RESULT_SQL, [
    args.status,
    args.totalCents,
    args.status === "ai_failed" ? args.failureStage : null,
    args.clientSentence ?? null,
    args.exclusions ?? null,
    args.roomsJson ?? null,
    args.quoteId,
    jobId,
  ]);
  return true;
}
