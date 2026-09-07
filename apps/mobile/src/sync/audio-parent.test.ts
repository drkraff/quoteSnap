import { resolveAudioQuoteServerId } from './audio-parent';

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
});
