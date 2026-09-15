export const CLIENT_SENTENCE_MAX_LENGTH = 2000;

export const CLIENT_SENTENCE_LABEL = 'Client sentence';

export const CLIENT_SENTENCE_HINT = 'Shown at the top of the customer PDF';

export const CLIENT_SENTENCE_PLACEHOLDER =
  'e.g. Appliances and decorative lighting not included.';

export function normalizeClientSentence(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > CLIENT_SENTENCE_MAX_LENGTH
    ? trimmed.slice(0, CLIENT_SENTENCE_MAX_LENGTH)
    : trimmed;
}
