/**
 * Whisper language pin for transcription.
 *
 * Product default is English (US trades). Hebrew (and other) users set
 * WHISPER_LANGUAGE explicitly (e.g. `he`). An empty string opts into
 * Whisper auto-detect.
 */
export function resolveWhisperLanguage(
  envValue: string | undefined
): string | undefined {
  if (envValue === "") {
    return undefined;
  }
  return envValue ?? "en";
}
