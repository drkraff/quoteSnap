export const PRIVATE_NOTE_MAX_LENGTH = 2000;

export const PRIVATE_NOTE_LABEL = 'Private note';

export const PRIVATE_NOTE_INTERNAL_HINT =
  'Internal only — never on the customer PDF';

export const LINE_PRIVATE_NOTE_ADD = 'Add private note';

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
