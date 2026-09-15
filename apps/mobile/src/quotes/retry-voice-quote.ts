/**
 * FAIL-04: re-queue the original local recording onto the same quote.
 * Does not create a new quote or invent prices. Missing quote / audio is a
 * no-op. Voice job id is cleared so the poller waits for the new upload
 * instead of latching onto the failed job.
 */

import {
  voiceUploadEnqueueParams,
  type VoiceUploadEnqueueParams,
} from './voice-upload-queue';

export type RetryVoiceQuotePlan =
  | { ok: false; reason: 'not_ai_failed' | 'missing_audio' | 'missing_quote' }
  | {
      ok: true;
      nextStatus: 'ai_processing';
      clearVoiceJobId: true;
      enqueue: VoiceUploadEnqueueParams;
    };

export function retryVoiceQuotePlan(input: {
  quoteId: string;
  status: string;
  filePath: string;
  audioExists: boolean;
}): RetryVoiceQuotePlan {
  if (input.status !== 'ai_failed') {
    return { ok: false, reason: 'not_ai_failed' };
  }
  const quoteId = input.quoteId.trim();
  if (!quoteId) {
    return { ok: false, reason: 'missing_quote' };
  }
  if (!input.audioExists || input.filePath.trim() === '') {
    return { ok: false, reason: 'missing_audio' };
  }
  return {
    ok: true,
    nextStatus: 'ai_processing',
    clearVoiceJobId: true,
    enqueue: voiceUploadEnqueueParams(quoteId, input.filePath),
  };
}

/** Queue rows that mean a FAIL-04 re-upload is still in flight. */
export function isPendingAudioRetryStatus(status: string): boolean {
  return status === 'pending' || status === 'in_progress' || status === 'failed';
}

export function audioRetryInFlight(items: {
  entityType: string;
  entityId: string;
  action: string;
  status: string;
}[], quoteId: string): boolean {
  return items.some(
    (item) =>
      item.entityType === 'audio' &&
      item.entityId === quoteId &&
      item.action === 'create' &&
      isPendingAudioRetryStatus(item.status),
  );
}

/** expo-router may pass quoteId as string | string[] on Record again. */
export function parseReuseQuoteId(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0].trim();
  }
  return '';
}
