import { CLIENT_SENTENCE_MAX_LENGTH } from "../quotes/client-sentence.js";
import { EXCLUSIONS_MAX_LENGTH } from "../quotes/customer-fields.js";

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

const SPOKEN_EXCLUSION_RE = /\b([a-z0-9]+(?:\s+[a-z0-9]+){0,6})\s+not included\b/gi;

const EXCLUSION_STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "but",
  "so",
  "then",
  "that",
  "this",
  "with",
  "for",
  "to",
  "of",
  "is",
  "are",
  "was",
  "were",
  "be",
  "plus",
  "also",
]);

function looseText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * "permit not included" said out loud. Keeps a short subject and drops a
 * price fragment. Does not invent an exclusion the contractor did not say.
 */
export function spokenExclusionPhrases(transcript: string): string[] {
  const phrases: string[] = [];
  const seen = new Set<string>();
  for (const match of transcript.toLowerCase().matchAll(SPOKEN_EXCLUSION_RE)) {
    let words = (match[1] ?? "").split(/\s+/).filter(Boolean);
    while (words.length > 1 && EXCLUSION_STOP.has(words[0] ?? "")) {
      words = words.slice(1);
    }
    if (words.length > 4) {
      words = words.slice(-4);
    }
    while (words.length > 1 && EXCLUSION_STOP.has(words[0] ?? "")) {
      words = words.slice(1);
    }
    if (words.length === 0) {
      continue;
    }
    const phrase = `${words.join(" ")} not included`;
    if (!isClientFacingSentence(phrase) || seen.has(phrase)) {
      continue;
    }
    seen.add(phrase);
    phrases.push(phrase);
  }
  return phrases;
}

/**
 * The job sentence stays the note. Assumptions, and a spoken "not included"
 * the model dropped, go to Not included. When both come back, both are kept.
 */
export function splitVoiceCustomerCopy(
  extract: { clientSentence?: unknown; assumptions?: unknown },
  transcript: string,
): { clientSentence: string | null; exclusions: string | null } {
  const clientSentence = sanitizeClientFacingSentence(extract.clientSentence);
  const fromModel = joinAssumptionsToClientSentence(extract.assumptions);
  const parts: string[] = [];
  if (fromModel) {
    parts.push(fromModel);
  }
  const have = looseText(fromModel ?? "");
  for (const phrase of spokenExclusionPhrases(transcript)) {
    if (!have.includes(looseText(phrase))) {
      parts.push(phrase);
    }
  }
  if (parts.length === 0) {
    return { clientSentence, exclusions: null };
  }
  const joined = parts.join("\n");
  const exclusions = joined.length > EXCLUSIONS_MAX_LENGTH
    ? joined.slice(0, EXCLUSIONS_MAX_LENGTH)
    : joined;
  return { clientSentence, exclusions };
}
