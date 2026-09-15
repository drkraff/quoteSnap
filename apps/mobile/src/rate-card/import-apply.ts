import { rateCardQueueEntityId } from './learn';
import {
  importedLinesToUpsertBodies,
  parseImportedQuoteText,
  type ImportedQuoteLine,
  type RateCardImportedUpsertBody,
} from './import-parse';
import {
  extractTextFromOldQuoteDocument,
  type OldQuotePickedFile,
} from './import-files';

export const IMPORT_PASTE_HINT =
  'Paste priced lines from the old quote. Photo and PDF reading is not ready yet.';

export type ImportApplyResult = {
  imported: number;
  skipped: number;
  payloads: RateCardImportedUpsertBody[];
  unreadableFiles: { filename: string; reason: string }[];
  message: string;
};

export function importResultMessage(args: {
  imported: number;
  skipped: number;
  unreadableFiles: { filename: string; reason: string }[];
}): string {
  if (args.imported > 0 && args.unreadableFiles.length === 0) {
    const extra =
      args.skipped > 0
        ? ` Skipped ${args.skipped} line${args.skipped === 1 ? '' : 's'} without a clear name, unit, and price.`
        : '';
    return `Added ${args.imported} price${args.imported === 1 ? '' : 's'} to your rate card.${extra}`;
  }
  if (args.imported > 0) {
    return `Added ${args.imported} price${args.imported === 1 ? '' : 's'} from the pasted lines. ${IMPORT_PASTE_HINT}`;
  }
  if (args.unreadableFiles.length > 0) {
    return IMPORT_PASTE_HINT;
  }
  if (args.skipped > 0) {
    return 'No prices found on those lines. Paste name, unit, and price (for example: Replace outlet    each    $85). You can skip and quote with blanks.';
  }
  return 'Nothing to import yet. Paste lines from an old quote, or skip and start quoting.';
}

export function previewImportedQuotes(args: {
  text: string;
  trade?: string | null;
  files?: OldQuotePickedFile[];
}): ImportApplyResult {
  const unreadableFiles: { filename: string; reason: string }[] = [];
  for (const file of args.files ?? []) {
    const extracted = extractTextFromOldQuoteDocument(file);
    if (extracted.status === 'needs_paste') {
      unreadableFiles.push({ filename: extracted.filename, reason: extracted.reason });
    }
  }
  const parsed = parseImportedQuoteText(args.text);
  const payloads = importedLinesToUpsertBodies(parsed.lines, args.trade);
  return {
    imported: payloads.length,
    skipped: parsed.skipped.length,
    payloads,
    unreadableFiles,
    message: importResultMessage({
      imported: payloads.length,
      skipped: parsed.skipped.length,
      unreadableFiles,
    }),
  };
}

export function importedLineQueueItems(
  lines: ImportedQuoteLine[],
  trade?: string | null,
): {
  entityType: 'rate_card';
  entityId: string;
  action: 'update';
  payload: RateCardImportedUpsertBody;
}[] {
  return importedLinesToUpsertBodies(lines, trade).map((payload) => ({
    entityType: 'rate_card' as const,
    entityId: rateCardQueueEntityId(payload),
    action: 'update' as const,
    payload,
  }));
}
