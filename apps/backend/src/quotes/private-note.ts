export const PRIVATE_NOTE_MAX_LENGTH = 2000;

export const PRIVATE_NOTE_FIELD_ERROR =
  `privateNote must be a string or null (max ${PRIVATE_NOTE_MAX_LENGTH} characters)`;

/**
 * Empty / whitespace → null. Does not invent contractor copy.
 */
export function normalizePrivateNote(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Empty / whitespace → null. Explicit null clears. Rejects non-strings and
 * over-length values so a client cannot dump a transcript into the column.
 */
export function parseOptionalPrivateNote(
  value: unknown,
): { ok: true; note: string | null } | { ok: false; error: string } {
  if (value === null) {
    return { ok: true, note: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: PRIVATE_NOTE_FIELD_ERROR };
  }
  const note = normalizePrivateNote(value);
  if (note === null) {
    return { ok: true, note: null };
  }
  if (note.length > PRIVATE_NOTE_MAX_LENGTH) {
    return { ok: false, error: PRIVATE_NOTE_FIELD_ERROR };
  }
  return { ok: true, note };
}
