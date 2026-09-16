/**
 * Conservative old-quote text → rate-card mapper (design §5).
 * Extracts name + unit + unit price only where they are literally present.
 * Never invents a price (no hourly math, no line-total ÷ qty).
 * Keep in sync with apps/backend/src/rate-card/import-parse.ts.
 */

import type { CatalogUnit } from '../catalog/units';

export const MAX_IMPORT_TEXT_CHARS = 50_000;
export const MAX_IMPORTED_LINES = 100;
export const MAX_OLD_QUOTE_FILES = 3;

export type ImportedQuoteLine = {
  name: string;
  unit: CatalogUnit;
  unitPriceCents: number;
};

export type SkippedImportedLineReason =
  | "empty"
  | "header"
  | "no_price"
  | "no_name"
  | "ambiguous_total"
  | "invalid_price";

export type SkippedImportedLine = {
  raw: string;
  reason: SkippedImportedLineReason;
};

export type ParseImportedQuoteResult = {
  lines: ImportedQuoteLine[];
  skipped: SkippedImportedLine[];
};

/** Item-like skips to show the contractor. Headers/letterhead stay counted, not listed. */
export const CONTENT_SKIP_REASONS: readonly SkippedImportedLineReason[] = [
  "no_price",
  "no_name",
  "ambiguous_total",
  "invalid_price",
];

export const MAX_SKIPPED_LINES_SHOWN = 8;
export const MAX_SKIPPED_LINE_CHARS = 80;

export function isContentSkipReason(reason: SkippedImportedLineReason): boolean {
  return (CONTENT_SKIP_REASONS as readonly string[]).includes(reason);
}

export function clipSkippedLineRaw(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (compact.length <= MAX_SKIPPED_LINE_CHARS) {
    return compact;
  }
  return `${compact.slice(0, MAX_SKIPPED_LINE_CHARS - 1)}…`;
}

export function skippedLinesForDisplay(
  skipped: SkippedImportedLine[],
): SkippedImportedLine[] {
  return skipped
    .filter((line) => isContentSkipReason(line.reason))
    .slice(0, MAX_SKIPPED_LINES_SHOWN);
}

export type RateCardImportedUpsertBody = {
  name: string;
  unit: CatalogUnit;
  unitPriceCents: number;
  source: "imported";
  trade?: string;
};

type UnitPattern = { unit: CatalogUnit; re: RegExp };

const UNIT_PATTERNS: UnitPattern[] = [
  { unit: "foot", re: /\b(?:linear\s+feet|linear\s+ft|lin(?:ear)?\s*ft\.?|l\.?f\.?|per\s+foot)\b/gi },
  { unit: "sqft", re: /\b(?:square\s+feet|square\s+foot|sq\.?\s*ft\.?|sqft)\b/gi },
  { unit: "hour", re: /\b(?:per\s+hour|hours?|hrs?)\b/gi },
  { unit: "job", re: /\b(?:lump\s*sum|per\s+job|jobs?)\b/gi },
  { unit: "each", re: /\b(?:per\s+(?:light|vent)|eaches|each|ea\.?|units?|pcs?|pieces?)\b/gi },
  { unit: "foot", re: /\bft\b/gi },
  { unit: "job", re: /\blot\b/gi },
];

const HEADER_RE =
  /^(?:quote(?:\s*#|\s+for|:)?|invoice(?:\s*#|:)?|estimate(?:\s*#|:)?|date\s*:|customer\s*:|client\s*:|bill\s+to|sold\s+to|job\s+address|phone\s*:|email\s*:|address\s*:|thanks?\b|thank\s+you|page\s+\d|payment\b|due\s+date|balance\s+due|amount\s+due|sub-?total\b|subtotal\b|total(?:\s+due)?\b|tax\b|qty\b.*\b(?:price|amount|unit)\b|(?:item|description)\b.*\bprice\b)/i;

const DOLLAR_RE =
  /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;

const AT_PRICE_RE =
  /@\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i;

const UNIT_PRICE_SUFFIX_RE =
  /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:\/\s*(h(?:rs?|ours?)?|ea(?:ch)?|ft|lf|sf|sqft)|(?:ea\.?|each))\b/i;

const TRAILING_PLAIN_MONEY_RE =
  /(?:^|\s)(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})\s*$/;

const LEADING_QTY_RE = /^(\d+(?:\.\d+)?)\s*(?:x\s+)?(?=[A-Za-z])/;

const INLINE_QTY_RE =
  /(?:^|\s)(\d+(?:\.\d+)?)\s+(?=hours?\b|hrs?\b|lin(?:ear)?\s*ft|linear\s+feet|sq\.?\s*ft|sqft|foot|feet|\bft\b|each\b|ea\.?\b|jobs?\b)/i;

const SLASH_UNIT_RE = /\/\s*(h(?:rs?|ours?)?|ea(?:ch)?|ft|lf|sf|sqft)\b/i;

function moneyToCents(raw: string): number | null {
  const stripped = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(stripped)) {
    return null;
  }
  const [whole, frac = ""] = stripped.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isInteger(cents) || cents <= 0) {
    return null;
  }
  return cents;
}

function firstUnitIn(text: string): CatalogUnit | null {
  for (const pattern of UNIT_PATTERNS) {
    pattern.re.lastIndex = 0;
    if (pattern.re.test(text)) {
      return pattern.unit;
    }
  }
  return null;
}

function unitFromSlashToken(token: string): CatalogUnit | null {
  const t = token.toLowerCase().replace(/\./g, "");
  if (t.startsWith("h")) return "hour";
  if (t.startsWith("ea")) return "each";
  if (t === "ft" || t === "lf") return "foot";
  if (t === "sf" || t === "sqft") return "sqft";
  return null;
}

function stripUnitsAndMoney(text: string): string {
  let next = text;
  next = next.replace(DOLLAR_RE, " ");
  next = next.replace(AT_PRICE_RE, " ");
  next = next.replace(UNIT_PRICE_SUFFIX_RE, " ");
  next = next.replace(SLASH_UNIT_RE, " ");
  for (const pattern of UNIT_PATTERNS) {
    pattern.re.lastIndex = 0;
    next = next.replace(pattern.re, " ");
  }
  return next.replace(/[@|/]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanImportedName(text: string): string {
  return stripUnitsAndMoney(text)
    .replace(/^[-–—:,.]+/, "")
    .replace(/[-–—:,.]+$/, "")
    .replace(/\s+\d+(?:\.\d+)?$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (HEADER_RE.test(trimmed)) {
    return true;
  }
  // Company / letterhead style: few words, no money, no unit token.
  if (!/\$/.test(trimmed) && firstUnitIn(trimmed) === null && trimmed.split(/\s+/).length <= 4) {
    const letters = trimmed.replace(/[^A-Za-z]/g, "");
    if (letters.length > 0 && letters === letters.toUpperCase() && letters.length >= 3) {
      return true;
    }
  }
  return false;
}

function parseLeadingQty(line: string): { qty: number; rest: string } {
  const match = LEADING_QTY_RE.exec(line);
  if (!match) {
    return { qty: 1, rest: line };
  }
  const qty = Number(match[1]);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { qty: 1, rest: line };
  }
  return { qty, rest: line.slice(match[0].length).trim() };
}

function parseDocumentQty(line: string): number {
  const leading = parseLeadingQty(line);
  if (leading.qty > 1) {
    return leading.qty;
  }
  const inline = INLINE_QTY_RE.exec(line);
  if (!inline) {
    return 1;
  }
  const qty = Number(inline[1]);
  if (!Number.isFinite(qty) || qty <= 0) {
    return 1;
  }
  return qty;
}

function extractExplicitUnitPrice(line: string): {
  cents: number;
  unitHint: CatalogUnit | null;
} | null {
  const atMatch = AT_PRICE_RE.exec(line);
  if (atMatch) {
    const cents = moneyToCents(atMatch[1] ?? "");
    if (cents !== null) {
      // @ is an explicit unit price, not a unit. Do not stamp `each` —
      // a foot/hour token on the same line must keep that unit.
      return { cents, unitHint: null };
    }
  }

  const suffixMatch = UNIT_PRICE_SUFFIX_RE.exec(line);
  if (suffixMatch) {
    const cents = moneyToCents(suffixMatch[1] ?? "");
    if (cents !== null) {
      return { cents, unitHint: unitFromSlashToken(suffixMatch[2] ?? suffixMatch[0] ?? "") };
    }
  }

  DOLLAR_RE.lastIndex = 0;
  const dollars: string[] = [];
  let dollarMatch: RegExpExecArray | null = DOLLAR_RE.exec(line);
  while (dollarMatch) {
    dollars.push(dollarMatch[1] ?? "");
    dollarMatch = DOLLAR_RE.exec(line);
  }
  if (dollars.length === 1) {
    const cents = moneyToCents(dollars[0] ?? "");
    if (cents !== null) {
      return { cents, unitHint: null };
    }
  }
  if (dollars.length > 1) {
    // Multiple $-amounts without @ is usually qty/total noise — do not guess.
    return null;
  }

  const trailing = TRAILING_PLAIN_MONEY_RE.exec(line);
  if (trailing) {
    const cents = moneyToCents(trailing[1] ?? "");
    if (cents !== null) {
      return { cents, unitHint: null };
    }
  }
  return null;
}

function parseOneLine(rawLine: string): ImportedQuoteLine | SkippedImportedLine {
  const raw = rawLine.replace(/\u00a0/g, " ").trim();
  if (raw === "") {
    return { raw, reason: "empty" };
  }
  if (isHeaderLine(raw)) {
    return { raw, reason: "header" };
  }

  const { rest } = parseLeadingQty(raw);
  const qty = parseDocumentQty(raw);
  const explicit = extractExplicitUnitPrice(rest);
  const unitFromLine = firstUnitIn(rest);
  const hadAt = AT_PRICE_RE.test(rest);
  const hadUnitPriceSuffix = UNIT_PRICE_SUFFIX_RE.test(rest);

  if (explicit === null) {
    return { raw, reason: "no_price" };
  }

  const unit = explicit.unitHint ?? unitFromLine;
  const name = cleanImportedName(rest);

  if (name === "" || name.length > 200) {
    return { raw, reason: "no_name" };
  }

  // Qty > 1 + a single money amount with no @ or /unit suffix is likely a line total.
  if (qty > 1 && !hadAt && !hadUnitPriceSuffix && explicit.unitHint === null) {
    return { raw, reason: "ambiguous_total" };
  }

  if (explicit.cents <= 0) {
    return { raw, reason: "invalid_price" };
  }

  return {
    name,
    unit: unit ?? "each",
    unitPriceCents: explicit.cents,
  };
}

function isImportedLine(value: ImportedQuoteLine | SkippedImportedLine): value is ImportedQuoteLine {
  return "unitPriceCents" in value;
}

/**
 * Last occurrence of the same name+unit wins (later line on the quote).
 * Does not invent missing units as anything other than `each` when the
 * document had a clear item + unit price and no unit token.
 */
export function parseImportedQuoteText(text: unknown): ParseImportedQuoteResult {
  if (typeof text !== "string" || text.trim() === "") {
    return { lines: [], skipped: [] };
  }
  const clipped = text.length > MAX_IMPORT_TEXT_CHARS ? text.slice(0, MAX_IMPORT_TEXT_CHARS) : text;
  const skipped: SkippedImportedLine[] = [];
  const byKey = new Map<string, ImportedQuoteLine>();

  for (const rawLine of clipped.split(/\r?\n/)) {
    const parsed = parseOneLine(rawLine);
    if (!isImportedLine(parsed)) {
      if (parsed.reason !== "empty") {
        skipped.push(parsed);
      }
      continue;
    }
    const key = `${parsed.name.toLowerCase()}|${parsed.unit}`;
    byKey.set(key, parsed);
    if (byKey.size >= MAX_IMPORTED_LINES) {
      break;
    }
  }

  return { lines: [...byKey.values()], skipped };
}

export function importedLinesToUpsertBodies(
  lines: ImportedQuoteLine[],
  trade?: string | null,
): RateCardImportedUpsertBody[] {
  const trimmedTrade = typeof trade === "string" ? trade.trim() : "";
  return lines.map((line) => ({
    name: line.name,
    unit: line.unit,
    unitPriceCents: line.unitPriceCents,
    source: "imported",
    ...(trimmedTrade ? { trade: trimmedTrade } : {}),
  }));
}
