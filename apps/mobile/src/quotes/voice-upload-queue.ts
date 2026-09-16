/**
 * FAIL-03: voice audio is queued locally; upload retries in the background.
 * The recorder must not Alert on offline / NetInfo-down / failed POST.
 * After SYNC-03 exhausts, the quote must not stay inert Queued / ai_processing.
 */

export type VoiceUploadEnqueueParams = {
  entityType: 'audio';
  entityId: string;
  action: 'create';
  payload: { filePath: string; quoteLocalId: string };
};

export type FailQuoteAfterAudioDeadLetterPlan =
  | { ok: false; reason: 'missing_quote' | 'not_ai_processing' }
  | { ok: true; nextStatus: 'ai_failed' };

export type ResumeQuoteAfterAudioDeadLetterRetryPlan =
  | { ok: false; reason: 'missing_quote' | 'not_ai_failed' }
  | { ok: true; nextStatus: 'ai_processing' };

export function voiceUploadEnqueueParams(
  quoteLocalId: string,
  filePath: string,
): VoiceUploadEnqueueParams {
  return {
    entityType: 'audio',
    entityId: quoteLocalId,
    action: 'create',
    payload: { filePath, quoteLocalId },
  };
}

function hasVoiceJobId(voiceJobId: string | null | undefined): boolean {
  return typeof voiceJobId === 'string' && voiceJobId.trim().length > 0;
}

/**
 * Quiet list caption: queued until the server accepted the file (`voiceJobId`)
 * or while NetInfo is down. Spinner only after upload succeeded.
 */
export function voiceUploadStillQueued(input: {
  status: string;
  voiceJobId?: string | null;
  online: boolean;
}): boolean {
  if (input.status !== 'ai_processing') return false;
  if (!input.online) return true;
  return !hasVoiceJobId(input.voiceJobId);
}

export function voiceUploadQueuedAccessibility(online: boolean): string {
  return online
    ? 'Quote queued, will retry'
    : 'Quote queued, will upload when online';
}

/** FAIL-03: after the m4a is in documentDirectory, never block the contractor. */
export function shouldAlertOnVoiceStopError(stage: 'before_persist' | 'after_persist'): boolean {
  return stage === 'before_persist';
}

/** SYNC-04 row for a voice upload that exhausted SYNC-03. */
export function isDeadLetterAudioUpload(item: {
  entityType: string;
  action?: string | null;
  status: string;
}): boolean {
  if (item.entityType !== 'audio' || item.status !== 'dead_letter') {
    return false;
  }
  return item.action == null || item.action === 'create' || item.action === 'update';
}

/**
 * Local status-only flip after the upload queue gives up.
 * Does not invent lines, cents, phone, or SKUs — FAIL-04/05 recovery owns those.
 * Not a mid-flow error: pending SYNC-03 retries stay ai_processing.
 */
export function failQuoteAfterAudioDeadLetterPlan(input: {
  quoteId?: string | null;
  status?: string | null;
}): FailQuoteAfterAudioDeadLetterPlan {
  const quoteId = typeof input.quoteId === 'string' ? input.quoteId.trim() : '';
  if (!quoteId) {
    return { ok: false, reason: 'missing_quote' };
  }
  if (input.status !== 'ai_processing') {
    return { ok: false, reason: 'not_ai_processing' };
  }
  return { ok: true, nextStatus: 'ai_failed' };
}

/**
 * Sync issues / FAIL-04 retry of a dead-lettered recording.
 * Only resumes the quiet upload loop. A contractor who already chose
 * Add items (draft_local) is left alone.
 */
export function resumeQuoteAfterAudioDeadLetterRetryPlan(input: {
  quoteId?: string | null;
  status?: string | null;
}): ResumeQuoteAfterAudioDeadLetterRetryPlan {
  const quoteId = typeof input.quoteId === 'string' ? input.quoteId.trim() : '';
  if (!quoteId) {
    return { ok: false, reason: 'missing_quote' };
  }
  if (input.status !== 'ai_failed') {
    return { ok: false, reason: 'not_ai_failed' };
  }
  return { ok: true, nextStatus: 'ai_processing' };
}
