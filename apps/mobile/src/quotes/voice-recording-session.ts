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
