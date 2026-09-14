import { localVoiceAudioPath, voiceAudioFileName } from './voice-audio';

describe('localVoiceAudioPath', () => {
  it('names the file after the local quote id', () => {
    expect(voiceAudioFileName('q1')).toBe('audio-q1.m4a');
    expect(localVoiceAudioPath('q1', 'file:///docs/')).toBe('file:///docs/audio-q1.m4a');
  });

  it('treats a null document directory as an empty prefix', () => {
    expect(localVoiceAudioPath('q1', null)).toBe('audio-q1.m4a');
    expect(localVoiceAudioPath('q1', undefined)).toBe('audio-q1.m4a');
  });
});
