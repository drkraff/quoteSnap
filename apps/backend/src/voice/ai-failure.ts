/**
 * Voice pipeline failure stages (FAIL-04 / FAIL-05).
 *
 * asr     — Whisper (or fetching audio for it) failed; original audio should be retried.
 * mapping — GPT-4o / validation / draft write failed after a transcript existed.
 * timeout — ai-processing-reaper cut a hung job (treat like mapping in the UI).
 *
 * Never written as failed_send (CONTEXT invariant 10).
 */

export const AI_FAILURE_STAGES = ["asr", "mapping", "timeout"] as const;

export type AiFailureStage = (typeof AI_FAILURE_STAGES)[number];

/** Needs Input tier is < 0.60 (VOICE-08). Flag salvaged mapping lines. */
export const MAPPING_FAILURE_MAX_CONFIDENCE = 0.59;

export function parseAiFailureStage(value: unknown): AiFailureStage | null {
  if (value === "asr" || value === "mapping" || value === "timeout") {
    return value;
  }
  return null;
}

export function isVoiceDraftReadable(status: string): boolean {
  return status !== "ai_processing";
}

export type FailedVoiceStatusPayload = {
  status: "failed";
  error: string;
  draftId: string;
  failureStage?: AiFailureStage;
};

export function failedVoiceStatusPayload(
  quoteId: string,
  stage: unknown,
): FailedVoiceStatusPayload {
  const failureStage = parseAiFailureStage(stage);
  return {
    status: "failed",
    error: "Processing failed",
    draftId: quoteId,
    ...(failureStage ? { failureStage } : {}),
  };
}

export const MARK_QUOTE_AI_FAILED_SQL = `UPDATE quotes
   SET status = 'ai_failed', ai_failure_stage = $2
 WHERE id = $1 AND status = 'ai_processing'`;

export type MarkQuoteAiFailedQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export async function markQuoteAiFailed(
  runQuery: MarkQuoteAiFailedQueryFn,
  quoteId: string,
  stage: AiFailureStage | null,
): Promise<void> {
  await runQuery(MARK_QUOTE_AI_FAILED_SQL, [quoteId, stage]);
}

/**
 * Cap confidence so salvaged GPT lines render as Needs Input in the draft
 * editor. Does not invent names or prices.
 */
export function flagPartialMappingLines<T extends { confidence: number }>(
  items: T[],
): T[] {
  return items.map((item) => ({
    ...item,
    confidence: Math.min(item.confidence, MAPPING_FAILURE_MAX_CONFIDENCE),
  }));
}
