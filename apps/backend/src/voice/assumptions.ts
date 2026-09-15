import { CLIENT_SENTENCE_MAX_LENGTH } from "../quotes/client-sentence.js";

/**
 * Join GPT `assumptions[]` (design extract JSON) into the durable
 * quotes.client_sentence text. Does not invent copy or prices: empty /
 * missing extract → null so COALESCE can keep an existing sentence.
 */
export function joinAssumptionsToClientSentence(value: unknown): string | null {
  const parts: string[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "string") continue;
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        parts.push(trimmed);
      }
    }
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
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
