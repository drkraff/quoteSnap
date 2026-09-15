/**
 * FAIL-03: voice audio is queued locally; upload retries in the background.
 * The recorder must not Alert on offline / NetInfo-down / failed POST.
 */

export type VoiceUploadEnqueueParams = {
  entityType: 'audio';
  entityId: string;
  action: 'create';
  payload: { filePath: string; quoteLocalId: string };
};

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
