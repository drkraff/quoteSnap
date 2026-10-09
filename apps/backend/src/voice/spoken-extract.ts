/**
 * Fill gaps the model drops from a contractor's own words.
 * Spoken sell prices, lump sums, and half hours come only from numbers
 * in the transcript. Nothing is invented when the words are not there.
 */

import { parseCatalogUnit } from "../catalog/units.js";
import { POSTGRES_INTEGER_MAX } from "../quotes/integer-money.js";
import type { AILineItem } from "../types/voice.js";
import { parseSpokenHours } from "../workers/voice-price-attach.js";

const CURRENCY =
  "(?:shekels?|shekel|nis|dollars?|bucks|₪|\\$)";

type Span = { start: number; end: number };

function overlaps(spans: Span[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

function centsFromAmount(raw: string): number | null {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const cents = Math.round(amount * 100);
  if (!Number.isInteger(cents) || cents <= 0 || cents > POSTGRES_INTEGER_MAX) {
    return null;
  }
  return cents;
}

function stem(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(stem)
    .filter((token) => token.length >= 4);
}

function isHourLine(item: AILineItem): boolean {
  return parseCatalogUnit(item.unit) === "hour";
}

function namesMatch(lineName: string, phrase: string): boolean {
  const phraseTokens = tokens(phrase);
  if (phraseTokens.length === 0) {
    return false;
  }
  const lineTokens = new Set(tokens(lineName));
  return phraseTokens.some((token) => lineTokens.has(token));
}

function cleanLumpName(raw: string): string {
  let name = raw.split(/[.,;]/)[0] ?? raw;
  name = name.replace(/\b(and\s+)?(labou?r|hours?|hrs?)\b.*$/i, "");
  name = name.replace(/^(for|the|a|an)\s+/i, "");
  name = name.replace(/\s+/g, " ").trim();
  if (name.length > 80) {
    name = name.slice(0, 80).trim();
  }
  return name;
}

function setSpokenPrice(item: AILineItem, cents: number): void {
  if (item.spokenUnitPriceCents === cents) {
    return;
  }
  item.spokenUnitPriceCents = cents;
}

/**
 * Explicit hour phrases only. "half an hour" is 0.5. A digit hour
 * ("3h", "3 hours") wins when both appear. No phrase → null (do not guess).
 */
export function spokenHoursFromTranscript(transcript: string): number | null {
  const lower = transcript.toLowerCase();
  const explicit = [...lower.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/g)];
  const half = /\b(?:a\s+)?half(?:\s+an)?\s+hours?\b|\bhalf\s+an\s+hr\b|\b30\s+minutes?\b/.test(
    lower,
  );
  if (explicit.length > 0) {
    const hours = parseSpokenHours(Number(explicit[0]![1]));
    if (hours != null) {
      return hours;
    }
  }
  if (half) {
    return 0.5;
  }
  return null;
}

function applyTranscriptHours(items: AILineItem[], hours: number): void {
  const labor = items.filter(isHourLine);
  if (labor.length !== 1) {
    return;
  }
  const line = labor[0]!;
  if (line.quantity !== hours) {
    line.quantity = hours;
  }
  if (!Number.isInteger(hours)) {
    line.confidence = Math.max(line.confidence ?? 0, 0.9);
  }
}

function materialLines(items: AILineItem[]): AILineItem[] {
  return items.filter((item) => !isHourLine(item) && typeof item.name === "string" && item.name.trim() !== "");
}

function lineForPhrase(items: AILineItem[], phrase: string): AILineItem | null {
  const materials = materialLines(items);
  const named = materials.filter((item) => namesMatch(item.name ?? "", phrase));
  if (named.length === 1) {
    return named[0]!;
  }
  if (phrase.trim() === "" && materials.length === 1) {
    return materials[0]!;
  }
  if (named.length === 0 && materials.length === 1) {
    return materials[0]!;
  }
  return null;
}

function alreadyHasLump(items: AILineItem[], name: string, cents: number): boolean {
  return items.some((item) => {
    if (!namesMatch(item.name ?? "", name) && !namesMatch(name, item.name ?? "")) {
      return false;
    }
    return item.spokenUnitPriceCents === cents || item.quantity === 1;
  });
}

/**
 * Apply spoken each-prices, bare prices, and "plus N for …" lump sums
 * from the transcript onto the extracted lines. Does not add a price
 * the contractor did not say.
 */
export function supplementSpokenExtract(
  transcript: string,
  items: AILineItem[],
  spokenHours: number | null,
): { items: AILineItem[]; spokenHours: number | null } {
  const next = items.map((item) => ({ ...item }));
  const text = transcript.toLowerCase();
  const consumed: Span[] = [];

  const eachRe = new RegExp(
    String.raw`([a-z][a-z0-9\s]{0,40}?)?\s*(\d+(?:\.\d+)?)\s*${CURRENCY}?\s*each\b`,
    "gi",
  );
  for (const match of text.matchAll(eachRe)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const cents = centsFromAmount(match[2] ?? "");
    if (cents == null) {
      continue;
    }
    consumed.push({ start, end });
    const phrase = (match[1] ?? "").replace(/\b(are|is|at|for|the|a|an)\b/g, " ");
    const line = lineForPhrase(next, phrase);
    if (line) {
      setSpokenPrice(line, cents);
    }
  }

  const lumpRe = new RegExp(
    String.raw`\bplus\s+(\d+(?:\.\d+)?)\s*${CURRENCY}?\s*(?:for\s+)?([a-z][a-z0-9\s/&-]{1,80})`,
    "gi",
  );
  for (const match of text.matchAll(lumpRe)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(consumed, start, end)) {
      continue;
    }
    const cents = centsFromAmount(match[1] ?? "");
    const name = cleanLumpName(match[2] ?? "");
    if (cents == null || name.length === 0) {
      continue;
    }
    consumed.push({ start, end });
    if (alreadyHasLump(next, name, cents)) {
      const existing = lineForPhrase(next, name);
      if (existing) {
        setSpokenPrice(existing, cents);
      }
      continue;
    }
    next.push({
      name,
      quantity: 1,
      unit: "job",
      spokenUnitPriceCents: cents,
      confidence: 0.9,
      catalogItemId: null,
    });
  }

  const bareRe = new RegExp(String.raw`\b(\d+(?:\.\d+)?)\s*${CURRENCY}\b`, "gi");
  for (const match of text.matchAll(bareRe)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(consumed, start, end)) {
      continue;
    }
    const cents = centsFromAmount(match[1] ?? "");
    if (cents == null) {
      continue;
    }
    const windowStart = Math.max(0, start - 40);
    const phrase = text.slice(windowStart, start);
    const line = lineForPhrase(next, phrase);
    if (line && line.spokenUnitPriceCents == null) {
      setSpokenPrice(line, cents);
    }
  }

  const fromTranscript = spokenHoursFromTranscript(transcript);
  const hours = fromTranscript ?? spokenHours;
  if (fromTranscript != null) {
    applyTranscriptHours(next, fromTranscript);
  }
  return { items: next, spokenHours: hours };
}
