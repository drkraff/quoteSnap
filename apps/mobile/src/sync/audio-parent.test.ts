import { resolveAudioQuoteServerId, quoteServerIdFromUploadError } from './audio-parent';

describe('resolveAudioQuoteServerId', () => {
  it('returns the parent server id when present', () => {
    expect(
      resolveAudioQuoteServerId({ serverId: 'server-quote-1', status: 'draft_local' }),
    ).toBe('server-quote-1');
  });

  it('treats blank server id as missing', () => {
    expect(() =>
      resolveAudioQuoteServerId({ serverId: '', status: 'draft_local' }),
    ).toThrow('Cannot sync audio: parent quote has no server ID yet');
    expect(() =>
      resolveAudioQuoteServerId({ serverId: '   ', status: 'sent' }),
    ).toThrow('parent quote has no server ID yet');
  });

  it('defers non-voice quotes until the parent create has synced', () => {
    expect(() =>
      resolveAudioQuoteServerId({ serverId: null, status: 'draft_local' }),
    ).toThrow('Cannot sync audio: parent quote has no server ID yet');
  });

  it('allows voice-first upload with no server id (backend creates the quote)', () => {
    expect(
      resolveAudioQuoteServerId({ serverId: null, status: 'ai_processing' }),
    ).toBeUndefined();
    expect(
      resolveAudioQuoteServerId({ serverId: '', status: 'ai_processing' }),
    ).toBeUndefined();
  });

  it('prefers a known server id on voice-first retry so upload can reuse the row', () => {
    expect(
      resolveAudioQuoteServerId({
        serverId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'ai_processing',
      }),
    ).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });
});

describe('quoteServerIdFromUploadError', () => {
  it('reads quoteId from a 500 body so the next retry can pass it', () => {
    expect(
      quoteServerIdFromUploadError({
        status: 500,
        error: 'Internal server error',
        quoteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('ignores missing, blank, or non-string quoteId', () => {
    expect(quoteServerIdFromUploadError(new Error('network down'))).toBeUndefined();
    expect(quoteServerIdFromUploadError({ status: 500, error: 'Internal server error' })).toBeUndefined();
    expect(
      quoteServerIdFromUploadError({ status: 500, error: 'Internal server error', quoteId: '  ' }),
    ).toBeUndefined();
  });
});
