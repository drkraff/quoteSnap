import { CLIENT_SENTENCE_MAX_LENGTH } from "../quotes/client-sentence.js";

const PRICE_OR_TRANSCRIPT_RE =
  /\b\d+(?:\.\d+)?\s*(?:shekels?|shekel|nis|dollars?|bucks|₪|\$)\b|\b(?:shekels?|shekel|nis|dollars?|bucks|₪|\$)\s*\d+|\bplus\s+\d+|\d+(?:\.\d+)?\s*(?:shekels?|shekel|nis|dollars?|bucks|₪|\$)?\s*each\b/i;

/**
 * A customer sentence names the job. A raw transcript fragment or a price
 * is not one — empty is better than quoting the recording.
 */
export function isClientFacingSentence(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return !PRICE_OR_TRANSCRIPT_RE.test(trimmed);
}

export function sanitizeClientFacingSentence(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!isClientFacingSentence(trimmed)) {
    return null;
  }
  return trimmed.length > CLIENT_SENTENCE_MAX_LENGTH
    ? trimmed.slice(0, CLIENT_SENTENCE_MAX_LENGTH)
    : trimmed;
}

/**
 * Join GPT `assumptions[]` (design extract JSON) into the durable
 * quotes.client_sentence text. Drops price fragments and raw transcript
 * quotes. Empty / missing extract → null so COALESCE can keep an existing sentence.
 * Does not invent copy.
 */
export function joinAssumptionsToClientSentence(value: unknown): string | null {
  const parts: string[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "string") continue;
      const trimmed = entry.trim();
      if (isClientFacingSentence(trimmed)) {
        parts.push(trimmed);
      }
    }
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (isClientFacingSentence(trimmed)) {
      parts.push(trimmed);
    }
  }
  if (parts.length === 0) {
    return null;
  }
  const joined = parts.join("\n");
  return joined.length > CLIENT_SENTENCE_MAX_LENGTH
    ? joined.slice(0, CLIENT_SENTENCE_MAX_LENGTH)
    : joined;
}
