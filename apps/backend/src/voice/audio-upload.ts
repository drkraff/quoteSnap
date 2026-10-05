import { isUuid } from "../uuid.js";

export const VOICE_MIME_ERROR =
  "audio must be an m4a, aac, mp3, wav, webm, ogg, or caf file";

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/x-caf",
]);

export function normalizeAudioMime(mime: string): string {
  return mime.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function voiceAudioMimeError(mime: unknown): string | null {
  if (typeof mime !== "string" || normalizeAudioMime(mime) === "") {
    return VOICE_MIME_ERROR;
  }
  if (!ALLOWED_AUDIO_MIMES.has(normalizeAudioMime(mime))) {
    return VOICE_MIME_ERROR;
  }
  return null;
}

export function voiceAudioR2Key(contractorId: string, fileId: string): string {
  if (!isUuid(contractorId) || !isUuid(fileId)) {
    throw new Error("invalid audio key");
  }
  return `audio/${contractorId}/${fileId}.m4a`;
}
