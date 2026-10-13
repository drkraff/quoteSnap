export const VOICE_UPLOAD_RETRY_BODY =
  'The recording is saved on this phone, but it did not join the upload queue. Try again.';

export const VOICE_UPLOAD_RETRY_LABEL = 'Try again';

/** Background ends the take. Inactive (notification shade) does not. */
export function shouldPersistRecordingOnBackground(
  appState: string,
  isRecording: boolean,
): boolean {
  return isRecording && appState === 'background';
}

export type VoiceStopFailureUx = 'quiet' | 'mic_settings' | 'save_alert';

export function voiceStopFailureUx(input: {
  persisted: boolean;
  permissionGranted: boolean;
}): VoiceStopFailureUx {
  if (input.persisted) return 'quiet';
  if (!input.permissionGranted) return 'mic_settings';
  return 'save_alert';
}

export function voiceEnqueueFailureUx(queued: boolean): 'leave' | 'retry_on_screen' {
  return queued ? 'leave' : 'retry_on_screen';
}

/**
 * After Stop, go straight to the draft when the m4a is in the offline queue.
 * A failed queue write stays on the recorder so Try again can enqueue it.
 * Null means stay. The href never carries audio bytes or a price.
 */
export function voiceAfterStopHref(input: { queued: boolean; quoteId: string }): string | null {
  if (!input.queued) return null;
  const quoteId = input.quoteId.trim();
  if (!quoteId) return null;
  return `/draft/${quoteId}`;
}

/**
 * A failed queue write leaves the m4a and the resume checkpoint. Closing the
 * recorder must keep that checkpoint. An in-progress cache take, or a take
 * that already joined the queue, is cleared on leave.
 */
export function shouldClearVoiceCheckpointOnLeave(keepForRecovery: boolean): boolean {
  return !keepForRecovery;
}
