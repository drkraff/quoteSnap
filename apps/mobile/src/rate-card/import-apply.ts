import { rateCardQueueEntityId } from './learn';
import {
  IMPORT_EMPTY_BODY,
  IMPORT_EMPTY_HEADING,
  IMPORT_NO_PRICES_BODY,
  IMPORT_NO_PRICES_HEADING,
  IMPORT_OCR_STUB_HEADING,
  IMPORT_PARTIAL_SKIP_HEADING,
  IMPORT_PASTE_HINT,
  skippedImportedLineLabels,
} from './import-copy';
import {
  importedLinesToUpsertBodies,
  parseImportedQuoteText,
  type ImportedQuoteLine,
  type RateCardImportedUpsertBody,
  type SkippedImportedLine,
} from './import-parse';
import {
  extractTextFromOldQuoteDocument,
  type OldQuotePickedFile,
} from './import-files';

export { IMPORT_PASTE_HINT } from './import-copy';

export type ImportApplyResult = {
  imported: number;
  skipped: number;
  skippedLines: SkippedImportedLine[];
  payloads: RateCardImportedUpsertBody[];
  unreadableFiles: { filename: string; reason: string }[];
  message: string;
};

export type ImportFeedbackTone = 'calm' | 'review';

export type ImportFeedbackView = {
  heading: string;
  body: string;
  skippedLabels: string[];
  tone: ImportFeedbackTone;
};

function skippedLinesMessageSuffix(skippedLines: SkippedImportedLine[]): string {
  const labels = skippedImportedLineLabels(skippedLines);
  if (labels.length === 0) {
    return '';
  }
  return ` ${labels.join('; ')}`;
}

export function importResultMessage(args: {
  imported: number;
  skipped: number;
  unreadableFiles: { filename: string; reason: string }[];
  skippedLines?: SkippedImportedLine[];
}): string {
  const skippedLines = args.skippedLines ?? [];
  const listed = skippedLinesMessageSuffix(skippedLines);

  if (args.imported > 0 && args.unreadableFiles.length === 0) {
    const extra =
      args.skipped > 0
        ? ` Skipped ${args.skipped} line${args.skipped === 1 ? '' : 's'} without a clear name, unit, and price.`
        : '';
    return `Added ${args.imported} price${args.imported === 1 ? '' : 's'} to your rate card.${extra}${listed}`;
  }
  if (args.imported > 0) {
    const extra =
      args.skipped > 0
        ? ` Skipped ${args.skipped} line${args.skipped === 1 ? '' : 's'} without a clear name, unit, and price.`
        : '';
    return `Added ${args.imported} price${args.imported === 1 ? '' : 's'} from the pasted lines — not from photos.${extra} ${IMPORT_PASTE_HINT}${listed}`;
  }
  if (args.unreadableFiles.length > 0 && args.skipped === 0) {
    return IMPORT_PASTE_HINT;
  }
  if (args.unreadableFiles.length > 0) {
    return `${IMPORT_PASTE_HINT} ${IMPORT_NO_PRICES_BODY}${listed}`;
  }
  if (args.skipped > 0) {
    return `${IMPORT_NO_PRICES_BODY}${listed}`;
  }
  return IMPORT_EMPTY_BODY;
}

export function importFeedbackView(result: ImportApplyResult): ImportFeedbackView {
  const skippedLabels = skippedImportedLineLabels(result.skippedLines);

  if (result.imported > 0) {
    return {
      heading:
        skippedLabels.length > 0
          ? IMPORT_PARTIAL_SKIP_HEADING
          : `Added ${result.imported} price${result.imported === 1 ? '' : 's'}`,
      body: result.message,
      skippedLabels,
      tone: skippedLabels.length > 0 ? 'review' : 'calm',
    };
  }
  if (result.unreadableFiles.length > 0 && result.skipped === 0) {
    return {
      heading: IMPORT_OCR_STUB_HEADING,
      body: IMPORT_PASTE_HINT,
      skippedLabels: [],
      tone: 'calm',
    };
  }
  if (result.unreadableFiles.length > 0) {
    return {
      heading: IMPORT_OCR_STUB_HEADING,
      body: `${IMPORT_PASTE_HINT} ${IMPORT_NO_PRICES_BODY}`,
      skippedLabels,
      tone: skippedLabels.length > 0 ? 'review' : 'calm',
    };
  }
  if (result.skipped > 0) {
    return {
      heading: IMPORT_NO_PRICES_HEADING,
      body: IMPORT_NO_PRICES_BODY,
      skippedLabels,
      tone: 'review',
    };
  }
  return {
    heading: IMPORT_EMPTY_HEADING,
    body: IMPORT_EMPTY_BODY,
    skippedLabels: [],
    tone: 'calm',
  };
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
    skippedLines: parsed.skipped,
    payloads,
    unreadableFiles,
    message: importResultMessage({
      imported: payloads.length,
      skipped: parsed.skipped.length,
      skippedLines: parsed.skipped,
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
