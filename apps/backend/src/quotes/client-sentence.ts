export const CLIENT_SENTENCE_MAX_LENGTH = 2000;

export const CLIENT_SENTENCE_FIELD_ERROR =
  `clientSentence must be a string or null (max ${CLIENT_SENTENCE_MAX_LENGTH} characters)`;

/**
 * Empty / whitespace → null. Explicit null clears. Rejects non-strings and
 * over-length values so a client cannot dump a transcript into the column.
 */
export function parseOptionalClientSentence(
  value: unknown,
): { ok: true; sentence: string | null } | { ok: false; error: string } {
  if (value === null) {
    return { ok: true, sentence: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: CLIENT_SENTENCE_FIELD_ERROR };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: true, sentence: null };
  }
  if (trimmed.length > CLIENT_SENTENCE_MAX_LENGTH) {
    return { ok: false, error: CLIENT_SENTENCE_FIELD_ERROR };
  }
  return { ok: true, sentence: trimmed };
}
