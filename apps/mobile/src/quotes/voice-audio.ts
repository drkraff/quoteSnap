/**
 * Local recording path for FAIL-04 retry.
 *
 * The file lives in documentDirectory (VOICE-02) as audio-{localQuoteId}.m4a
 * so the original recording stays available after the sync-queue audio item
 * is destroyed on successful upload.
 */

export function voiceAudioFileName(quoteId: string): string {
  return `audio-${quoteId}.m4a`;
}

export function localVoiceAudioPath(
  quoteId: string,
  documentDirectory: string | null | undefined,
): string {
  return `${documentDirectory ?? ''}${voiceAudioFileName(quoteId)}`;
}
