import {
  VOICE_UPLOAD_RETRY_BODY,
  VOICE_UPLOAD_RETRY_LABEL,
  shouldPersistRecordingOnBackground,
  voiceEnqueueFailureUx,
  voiceStopFailureUx,
} from './voice-recording-session';

describe('shouldPersistRecordingOnBackground', () => {
  it('saves an in-progress take when the app is backgrounded', () => {
    expect(shouldPersistRecordingOnBackground('background', true)).toBe(true);
    expect(shouldPersistRecordingOnBackground('inactive', true)).toBe(false);
    expect(shouldPersistRecordingOnBackground('background', false)).toBe(false);
    expect(shouldPersistRecordingOnBackground('active', true)).toBe(false);
  });
});

describe('voiceStopFailureUx', () => {
  it('points at Settings when the mic is denied mid-take and stays quiet after the file is saved', () => {
    expect(voiceStopFailureUx({ persisted: false, permissionGranted: false })).toBe('mic_settings');
    expect(voiceStopFailureUx({ persisted: false, permissionGranted: true })).toBe('save_alert');
    expect(voiceStopFailureUx({ persisted: true, permissionGranted: false })).toBe('quiet');
  });
});

describe('voiceEnqueueFailureUx', () => {
  it('keeps a retry on screen when the upload queue write fails', () => {
    expect(voiceEnqueueFailureUx(false)).toBe('retry_on_screen');
    expect(voiceEnqueueFailureUx(true)).toBe('leave');
    expect(VOICE_UPLOAD_RETRY_BODY.toLowerCase()).toContain('try again');
    expect(VOICE_UPLOAD_RETRY_LABEL).toBe('Try again');
    expect(VOICE_UPLOAD_RETRY_BODY.toLowerCase()).not.toContain('stack');
  });
});
