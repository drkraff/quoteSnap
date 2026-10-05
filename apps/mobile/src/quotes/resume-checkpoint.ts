/**
 * FAIL-07: recover mid-recording / mid-draft work after a crash or kill.
 *
 * Already durable today (not this table):
 * - Draft line items, phone, private notes, client sentence write SQLite on edit
 *   (REVIEW-05). Sync enqueue stays debounced.
 * - After Stop, VOICE-02 moves the m4a to documentDirectory and FAIL-03 queues
 *   upload without a mid-flow Alert.
 *
 * Gap this table fills: there is no "you were on this screen" pointer, and a
 * live expo-av take still lives in cache until Stop. We persist a single
 * local checkpoint while recording or while the draft editor is focused.
 * expo-av does not expose a custom output path, so in-progress audio is not
 * copied into SQLite; Resume reopens the recorder.
 */

export const RESUME_PROMPT_TITLE = 'Resume where you left off';
export const RESUME_PROMPT_RESUME = 'Resume';
export const RESUME_PROMPT_DISMISS = 'Not now';

export const RESUME_KIND_VOICE = 'voice_recording' as const;
export const RESUME_KIND_DRAFT = 'draft_edit' as const;

export type ResumeKind = typeof RESUME_KIND_VOICE | typeof RESUME_KIND_DRAFT;

export type ResumeCheckpointFields = {
  kind: ResumeKind;
  quoteId: string | null;
  audioUri: string | null;
};

export type ResumeQuoteSnapshot = {
  status: string;
  isArchived?: boolean | null;
};

export type ResumeTarget = {
  kind: ResumeKind;
  href: string;
  quoteId: string | null;
};

export function isResumeKind(value: string): value is ResumeKind {
  return value === RESUME_KIND_VOICE || value === RESUME_KIND_DRAFT;
}

export function normalizeResumeQuoteId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function parseResumeCheckpointRow(row: {
  kind: string;
  quoteId?: string | null;
  audioUri?: string | null;
}): ResumeCheckpointFields | null {
  if (!isResumeKind(row.kind)) return null;
  return {
    kind: row.kind,
    quoteId: normalizeResumeQuoteId(row.quoteId),
    audioUri: normalizeResumeQuoteId(row.audioUri),
  };
}

export function resumePromptBody(kind: ResumeKind): string {
  if (kind === RESUME_KIND_VOICE) {
    return 'You were recording a voice quote when the app closed.';
  }
  return 'You were editing a quote draft when the app closed.';
}

export function resumeHref(input: {
  kind: ResumeKind;
  quoteId: string | null;
}): string | null {
  if (input.kind === RESUME_KIND_DRAFT) {
    return input.quoteId ? `/draft/${input.quoteId}` : null;
  }
  return input.quoteId
    ? `/voice-record?quoteId=${input.quoteId}`
    : '/voice-record';
}

export function canResumeDraftQuote(quote: ResumeQuoteSnapshot | null | undefined): boolean {
  if (!quote) return false;
  if (quote.isArchived === true) return false;
  return quote.status === 'draft_local' || quote.status === 'ai_failed';
}

/**
 * Stop already created the local quote + m4a. When an upload queue row owns
 * it, do not send the contractor back to the mic — FAIL-03 owns that row.
 * An ai_processing take with no queue row is recovered by pickResumeTarget.
 */
export function voiceStopAlreadyPersisted(
  quote: ResumeQuoteSnapshot | null | undefined,
): boolean {
  return quote?.status === 'ai_processing';
}

const AUDIO_QUEUE_STATUSES = new Set(['pending', 'in_progress', 'failed', 'dead_letter']);

/** True when a voice upload row already owns this quote. */
export function voiceUploadQueuedForResume(
  items: { entityType: string; entityId: string; action: string; status: string }[],
  quoteId: string | null | undefined,
): boolean {
  const id = quoteId?.trim() ?? '';
  if (!id) return false;
  return items.some(
    (item) =>
      item.entityType === 'audio'
      && item.entityId === id
      && item.action === 'create'
      && AUDIO_QUEUE_STATUSES.has(item.status),
  );
}

/**
 * Saved file from a stop whose enqueue never landed. Reopening the recorder
 * can retry that file. A queued ai_processing take stays with FAIL-03.
 */
export function pendingVoiceUploadFromCheckpoint(input: {
  checkpoint: ResumeCheckpointFields | null;
  routeQuoteId: string;
  quoteStatus: string | null | undefined;
}): { quoteId: string; filePath: string } | null {
  if (input.quoteStatus !== 'ai_processing') return null;
  const checkpoint = input.checkpoint;
  if (!checkpoint || checkpoint.kind !== RESUME_KIND_VOICE) return null;
  const routeQuoteId = input.routeQuoteId.trim();
  if (!routeQuoteId || checkpoint.quoteId !== routeQuoteId) return null;
  const filePath = checkpoint.audioUri?.trim() ?? '';
  if (!filePath) return null;
  return { quoteId: routeQuoteId, filePath };
}

export function pickResumeTarget(input: {
  checkpoint: ResumeCheckpointFields | null;
  quote?: ResumeQuoteSnapshot | null;
  /** Explicit false: stop saved the file and nothing is in the upload queue. */
  voiceUploadQueued?: boolean;
}): ResumeTarget | null {
  const checkpoint = input.checkpoint;
  if (!checkpoint) return null;

  if (checkpoint.kind === RESUME_KIND_DRAFT) {
    if (!checkpoint.quoteId) return null;
    if (!canResumeDraftQuote(input.quote)) return null;
    const href = resumeHref({
      kind: RESUME_KIND_DRAFT,
      quoteId: checkpoint.quoteId,
    });
    if (!href) return null;
    return { kind: RESUME_KIND_DRAFT, href, quoteId: checkpoint.quoteId };
  }

  if (voiceStopAlreadyPersisted(input.quote)) {
    if (
      input.voiceUploadQueued === false
      && checkpoint.quoteId
      && checkpoint.audioUri
    ) {
      const href = resumeHref({
        kind: RESUME_KIND_VOICE,
        quoteId: checkpoint.quoteId,
      });
      if (!href) return null;
      return { kind: RESUME_KIND_VOICE, href, quoteId: checkpoint.quoteId };
    }
    return null;
  }

  const quoteId = input.quote ? checkpoint.quoteId : null;
  const href = resumeHref({ kind: RESUME_KIND_VOICE, quoteId });
  if (!href) return null;
  return { kind: RESUME_KIND_VOICE, href, quoteId };
}

let resumePromptConsumed = false;

/** True unless this JS process already showed (or started) the cold-start prompt. */
export function beginResumePromptIfNeeded(): boolean {
  if (resumePromptConsumed) return false;
  resumePromptConsumed = true;
  return true;
}

/** React Strict Mode / a cancelled first pass must not eat the only prompt slot. */
export function releaseResumePromptSlot(): void {
  resumePromptConsumed = false;
}

export function resetResumePromptSlotForTests(): void {
  resumePromptConsumed = false;
}
