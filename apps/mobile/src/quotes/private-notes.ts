export const PRIVATE_NOTE_MAX_LENGTH = 2000;

export const PRIVATE_NOTE_LABEL = 'Private note';

export const PRIVATE_NOTE_INTERNAL_HINT =
  'Internal only — never on the customer PDF';

export const LINE_PRIVATE_NOTE_ADD = 'Add private note';

/** Input hint only — never persist or copy onto the customer PDF. */
export const PRIVATE_NOTE_PLACEHOLDER =
  'Visible only to you — never sent to the customer';

export function normalizePrivateNote(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > PRIVATE_NOTE_MAX_LENGTH
    ? trimmed.slice(0, PRIVATE_NOTE_MAX_LENGTH)
    : trimmed;
}

export function hasPrivateNote(value: string | null | undefined): boolean {
  return normalizePrivateNote(value) != null;
}

/** TextInput value: empty / whitespace stays blank (placeholder is hint-only). */
export function privateNoteFieldValue(
  value: string | null | undefined,
): string {
  return normalizePrivateNote(value) ?? '';
}

/**
 * Copy an explicit note onto a row. Omitted (`undefined`) stays omitted so
 * older JSON without the key is unchanged; null / whitespace persist as null.
 */
export function assignNormalizedPrivateNote<T extends { privateNote?: string | null }>(
  target: T,
  value: string | null | undefined,
): void {
  if (value === undefined) return;
  target.privateNote = normalizePrivateNote(value);
}
