import {
  shouldAlertOnVoiceStopError,
  voiceUploadEnqueueParams,
  voiceUploadQueuedAccessibility,
  voiceUploadStillQueued,
} from './voice-upload-queue';

describe('voiceUploadEnqueueParams', () => {
  it('queues the local file on the same quote (VOICE-03 / FAIL-03)', () => {
    expect(voiceUploadEnqueueParams('local-q1', 'file:///docs/audio-local-q1.m4a')).toEqual({
      entityType: 'audio',
      entityId: 'local-q1',
      action: 'create',
      payload: {
        filePath: 'file:///docs/audio-local-q1.m4a',
        quoteLocalId: 'local-q1',
      },
    });
  });
});

describe('voiceUploadStillQueued', () => {
  it('is queued while offline even if a job id already exists', () => {
    expect(
      voiceUploadStillQueued({
        status: 'ai_processing',
        voiceJobId: 'job-1',
        online: false,
      }),
    ).toBe(true);
  });

  it('is queued while online until the server accepts the upload', () => {
    expect(
      voiceUploadStillQueued({
        status: 'ai_processing',
        voiceJobId: null,
        online: true,
      }),
    ).toBe(true);
    expect(
      voiceUploadStillQueued({
        status: 'ai_processing',
        voiceJobId: '  ',
        online: true,
      }),
    ).toBe(true);
  });

  it('is not queued once a voice job id exists and NetInfo is up', () => {
    expect(
      voiceUploadStillQueued({
        status: 'ai_processing',
        voiceJobId: 'job-1',
        online: true,
      }),
    ).toBe(false);
  });

  it('does not treat draft or ai_failed rows as a quiet upload queue', () => {
    expect(
      voiceUploadStillQueued({
        status: 'ai_failed',
        voiceJobId: null,
        online: true,
      }),
    ).toBe(false);
    expect(
      voiceUploadStillQueued({
        status: 'draft_local',
        voiceJobId: null,
        online: false,
      }),
    ).toBe(false);
  });
});

describe('voiceUploadQueuedAccessibility', () => {
  it('uses will-retry copy when NetInfo is up and will-upload when offline', () => {
    expect(voiceUploadQueuedAccessibility(true)).toBe('Quote queued, will retry');
    expect(voiceUploadQueuedAccessibility(false)).toBe('Quote queued, will upload when online');
  });
});

describe('shouldAlertOnVoiceStopError', () => {
  it('does not Alert after the local file is saved (FAIL-03)', () => {
    expect(shouldAlertOnVoiceStopError('after_persist')).toBe(false);
  });

  it('still Alerts when recording or the local move failed', () => {
    expect(shouldAlertOnVoiceStopError('before_persist')).toBe(true);
  });
});
