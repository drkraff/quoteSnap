/**
 * FAIL-04 / FAIL-05 contractor copy and recover plan. Distinct from failed_send (SMS).
 * Empty / missing draft is a calm no-op: no invented line items, prices, or phone.
 */

export type AiFailureStage = 'asr' | 'mapping' | 'timeout';

export type AiFailedRecoveryView = {
  title: string;
  body: string;
  showRetry: boolean;
  showRecordAgain: boolean;
  retryLabel: string;
  manualLabel: string;
  recordAgainLabel: string;
};

export type RecoverAiFailedPlan =
  | { ok: false; reason: 'not_ai_failed' | 'missing_quote' }
  | {
      ok: true;
      nextStatus: 'draft_local';
      enqueue: {
        entityType: 'quote';
        entityId: string;
        action: 'update';
        payload: { status: 'draft_local' };
      };
    };

const RETRY_LABEL = 'Retry recording';
const MANUAL_LABEL = 'Add items';
const RECORD_AGAIN_LABEL = 'Record again';

export function parseAiFailureStage(value: unknown): AiFailureStage | null {
  if (value === 'asr' || value === 'mapping' || value === 'timeout') {
    return value;
  }
  return null;
}

/** Count only. Junk / missing JSON is 0 — never materializes SKUs or cents. */
export function lineCountFromDraftJson(json: string | null | undefined): number {
  if (json == null || json.trim() === '') {
    return 0;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function resolveAiFailedLineCount(input: {
  lineCount?: number | null;
  lineItemsJson?: string | null;
}): number {
  if (typeof input.lineCount === 'number' && Number.isFinite(input.lineCount)) {
    return input.lineCount > 0 ? Math.floor(input.lineCount) : 0;
  }
  return lineCountFromDraftJson(input.lineItemsJson);
}

function mappingBody(lineCount: number, audioExists: boolean): string {
  if (lineCount > 0) {
    return audioExists
      ? 'Review the flagged lines, add catalog items yourself, or retry the original recording.'
      : 'Review the flagged lines, or add catalog items yourself.';
  }
  return audioExists
    ? 'Add items from your catalog, or retry the original recording if it is still on this device.'
    : 'Add items from your catalog, or record again.';
}

export function aiFailedRecoveryView(input: {
  audioExists: boolean;
  lineCount?: number | null;
  lineItemsJson?: string | null;
  failureStage?: AiFailureStage | null;
}): AiFailedRecoveryView {
  const lineCount = resolveAiFailedLineCount(input);
  const showRetry = input.audioExists === true;
  const showRecordAgain = !showRetry;
  const mappingLike =
    lineCount > 0 ||
    input.failureStage === 'mapping' ||
    input.failureStage === 'timeout';

  if (mappingLike) {
    return {
      title: "Couldn't finish this quote from the recording",
      body: mappingBody(lineCount, showRetry),
      showRetry,
      showRecordAgain,
      retryLabel: RETRY_LABEL,
      manualLabel: MANUAL_LABEL,
      recordAgainLabel: RECORD_AGAIN_LABEL,
    };
  }

  return {
    title: "Couldn't transcribe this recording",
    body: showRetry
      ? 'Your audio is still on this device. Retry the same recording, or add items from your catalog.'
      : 'The original audio is no longer on this device. Record again, or add items from your catalog.',
    showRetry,
    showRecordAgain,
    retryLabel: RETRY_LABEL,
    manualLabel: MANUAL_LABEL,
    recordAgainLabel: RECORD_AGAIN_LABEL,
  };
}

/**
 * Status-only recover so catalog add / send can proceed (A-10).
 * Missing quote or non-ai_failed is a no-op. Does not invent a draft, lines,
 * cents, or phone — those stay whatever is already stored.
 */
export function recoverAiFailedPlan(input: {
  quoteId?: string | null;
  status?: string | null;
}): RecoverAiFailedPlan {
  const quoteId = typeof input.quoteId === 'string' ? input.quoteId.trim() : '';
  if (!quoteId) {
    return { ok: false, reason: 'missing_quote' };
  }
  if (input.status !== 'ai_failed') {
    return { ok: false, reason: 'not_ai_failed' };
  }
  return {
    ok: true,
    nextStatus: 'draft_local',
    enqueue: {
      entityType: 'quote',
      entityId: quoteId,
      action: 'update',
      payload: { status: 'draft_local' },
    },
  };
}
