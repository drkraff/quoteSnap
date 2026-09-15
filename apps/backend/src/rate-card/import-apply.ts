import { upsertRateCardEntry, type RateCardQueryFn } from "./upsert.js";
import {
  capOldQuoteDocuments,
  extractTextFromOldQuoteDocument,
  joinExtractedQuoteTexts,
  type OldQuoteDocumentInput,
  type UnreadableOldQuoteReason,
} from "./import-files.js";
import {
  importedLinesToUpsertBodies,
  parseImportedQuoteText,
  type ImportedQuoteLine,
  type ParseImportedQuoteResult,
} from "./import-parse.js";
import type { RateCardEntryResponse } from "../types/rate-card.js";

export const IMPORT_PASTE_HINT =
  "Paste priced lines from the old quote. Photo and PDF reading is not ready yet.";

export type UnreadableOldQuoteFile = {
  filename: string;
  reason: UnreadableOldQuoteReason;
};

export type ImportOldQuotesJson = {
  imported: number;
  skipped: number;
  entries: RateCardEntryResponse[];
  unreadableFiles: UnreadableOldQuoteFile[];
  message: string;
};

export type ImportOldQuotesOutcome =
  | { status: 400; json: { error: string } }
  | { status: 200; json: ImportOldQuotesJson };

export type ImportOldQuotesBody = {
  text?: unknown;
  trade?: unknown;
  documents?: unknown;
};

function asBodyObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

function parseDocuments(value: unknown): OldQuoteDocumentInput[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const docs: OldQuoteDocumentInput[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const raw = item as Record<string, unknown>;
    docs.push({
      filename: typeof raw.filename === "string" ? raw.filename : undefined,
      mime: typeof raw.mime === "string" ? raw.mime : undefined,
      text: typeof raw.text === "string" ? raw.text : undefined,
    });
  }
  return capOldQuoteDocuments(docs);
}

function parseTrade(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function importResultMessage(args: {
  imported: number;
  skipped: number;
  unreadableFiles: UnreadableOldQuoteFile[];
}): string {
  if (args.imported > 0 && args.unreadableFiles.length === 0) {
    const extra =
      args.skipped > 0
        ? ` Skipped ${args.skipped} line${args.skipped === 1 ? "" : "s"} without a clear name, unit, and price.`
        : "";
    return `Added ${args.imported} price${args.imported === 1 ? "" : "s"} to your rate card.${extra}`;
  }
  if (args.imported > 0) {
    return `Added ${args.imported} price${args.imported === 1 ? "" : "s"} from the pasted lines. ${IMPORT_PASTE_HINT}`;
  }
  if (args.unreadableFiles.length > 0) {
    return IMPORT_PASTE_HINT;
  }
  if (args.skipped > 0) {
    return "No prices found on those lines. Paste name, unit, and price (for example: Replace outlet    each    $85). You can skip and quote with blanks.";
  }
  return "Nothing to import yet. Paste lines from an old quote, or skip and start quoting.";
}

export function collectImportText(body: ImportOldQuotesBody): {
  text: string;
  unreadableFiles: UnreadableOldQuoteFile[];
} {
  const chunks: string[] = [];
  if (typeof body.text === "string" && body.text.trim() !== "") {
    chunks.push(body.text);
  }
  const unreadableFiles: UnreadableOldQuoteFile[] = [];
  for (const doc of parseDocuments(body.documents)) {
    const extracted = extractTextFromOldQuoteDocument(doc);
    if (extracted.status === "text") {
      chunks.push(extracted.text);
    } else {
      unreadableFiles.push({ filename: extracted.filename, reason: extracted.reason });
    }
  }
  return { text: joinExtractedQuoteTexts(chunks), unreadableFiles };
}

export async function applyImportedQuoteLines(
  queryFn: RateCardQueryFn,
  args: {
    contractorId: string;
    lines: ImportedQuoteLine[];
    trade?: string | null;
    recordedAtIso?: string;
  },
): Promise<RateCardEntryResponse[]> {
  const bodies = importedLinesToUpsertBodies(args.lines, args.trade);
  const entries: RateCardEntryResponse[] = [];
  for (const body of bodies) {
    const outcome = await upsertRateCardEntry(queryFn, {
      contractorId: args.contractorId,
      body,
      recordedAtIso: args.recordedAtIso,
    });
    if (outcome.status === 200) {
      entries.push(outcome.json.entry);
    }
  }
  return entries;
}

export async function importOldQuotes(
  queryFn: RateCardQueryFn,
  args: { contractorId: string; body: unknown; recordedAtIso?: string },
): Promise<ImportOldQuotesOutcome> {
  const raw = asBodyObject(args.body);
  const collected = collectImportText({
    text: raw.text,
    trade: raw.trade,
    documents: raw.documents,
  });
  const parsed: ParseImportedQuoteResult = parseImportedQuoteText(collected.text);
  const trade = parseTrade(raw.trade);
  const entries = await applyImportedQuoteLines(queryFn, {
    contractorId: args.contractorId,
    lines: parsed.lines,
    trade,
    recordedAtIso: args.recordedAtIso,
  });
  const json: ImportOldQuotesJson = {
    imported: entries.length,
    skipped: parsed.skipped.length,
    entries,
    unreadableFiles: collected.unreadableFiles,
    message: importResultMessage({
      imported: entries.length,
      skipped: parsed.skipped.length,
      unreadableFiles: collected.unreadableFiles,
    }),
  };
  return { status: 200, json };
}
