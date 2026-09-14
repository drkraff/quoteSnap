import {
  audioRetryInFlight,
  parseReuseQuoteId,
  retryVoiceQuotePlan,
} from './retry-voice-quote';

describe('retryVoiceQuotePlan', () => {
  const base = {
    quoteId: 'local-q1',
    status: 'ai_failed',
    filePath: 'file:///docs/audio-local-q1.m4a',
    audioExists: true,
  };

  it('requeues the same file onto the same quote and clears the old job id', () => {
    expect(retryVoiceQuotePlan(base)).toEqual({
      ok: true,
      nextStatus: 'ai_processing',
      clearVoiceJobId: true,
      enqueue: {
        entityType: 'audio',
        entityId: 'local-q1',
        action: 'create',
        payload: {
          filePath: 'file:///docs/audio-local-q1.m4a',
          quoteLocalId: 'local-q1',
        },
      },
    });
  });

  it('does not retry a draft that is not ai_failed', () => {
    expect(retryVoiceQuotePlan({ ...base, status: 'draft_local' })).toEqual({
      ok: false,
      reason: 'not_ai_failed',
    });
    expect(retryVoiceQuotePlan({ ...base, status: 'failed_send' })).toEqual({
      ok: false,
      reason: 'not_ai_failed',
    });
  });

  it('does not retry when the original audio file is gone', () => {
    expect(retryVoiceQuotePlan({ ...base, audioExists: false })).toEqual({
      ok: false,
      reason: 'missing_audio',
    });
    expect(retryVoiceQuotePlan({ ...base, filePath: '' })).toEqual({
      ok: false,
      reason: 'missing_audio',
    });
  });
});

describe('audioRetryInFlight', () => {
  it('holds the poller while the same quote has a pending audio upload', () => {
    expect(
      audioRetryInFlight(
        [
          {
            entityType: 'audio',
            entityId: 'local-q1',
            action: 'create',
            status: 'pending',
          },
        ],
        'local-q1',
      ),
    ).toBe(true);
  });

  it('does not hold for other quotes or finished items', () => {
    expect(
      audioRetryInFlight(
        [
          {
            entityType: 'audio',
            entityId: 'other',
            action: 'create',
            status: 'pending',
          },
          {
            entityType: 'quote',
            entityId: 'local-q1',
            action: 'update',
            status: 'pending',
          },
        ],
        'local-q1',
      ),
    ).toBe(false);
  });
});

describe('parseReuseQuoteId', () => {
  it('reads a string or the first array value from the voice-record route', () => {
    expect(parseReuseQuoteId('abc')).toBe('abc');
    expect(parseReuseQuoteId(['abc', 'other'])).toBe('abc');
    expect(parseReuseQuoteId('  abc  ')).toBe('abc');
    expect(parseReuseQuoteId(undefined)).toBe('');
    expect(parseReuseQuoteId(12)).toBe('');
  });
});
