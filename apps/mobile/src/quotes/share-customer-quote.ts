/**
 * Builds a customer-safe quote file and opens the OS share sheet.
 * Prefers expo-print HTML→PDF; falls back to a shareable HTML file.
 * Does not send SMS (Phase 6).
 */

import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  CUSTOMER_QUOTE_FILENAME_HTML,
  CUSTOMER_QUOTE_FILENAME_PDF,
  customerQuoteToDocument,
  type CustomerDocumentBrand,
} from './customer-document';
import {
  toCustomerQuotePayload,
  type CustomerQuoteSource,
} from './customer-payload';

export const SHARE_QUOTE_LABEL = 'Share quote';
export const SHARE_QUOTE_EMPTY = 'Add at least one item before sharing';
export const SHARE_QUOTE_UNAVAILABLE = 'Sharing is not available on this device';
export const SHARE_QUOTE_CANCELLED =
  'Share was cancelled. The quote was not marked sent — tap Share quote to try again.';
export const SHARE_QUOTE_FAILED =
  'The quote could not be shared. It was not marked sent — tap Share quote to try again.';

export const SHARE_QUOTE_CONFIRM_SENT_TITLE = 'Mark quote sent?';
export const SHARE_QUOTE_CONFIRM_SENT_BODY =
  'If you sent the file, we freeze these prices so they cannot change. If you closed the share sheet, pick Not yet.';
export const SHARE_QUOTE_CONFIRM_SENT_YES = 'I sent it';
export const SHARE_QUOTE_CONFIRM_SENT_NO = 'Not yet';

export const SHARE_QUOTE_ALERT_CANNOT = 'Cannot share';
export const SHARE_QUOTE_ALERT_CANCELLED = 'Share cancelled';
export const SHARE_QUOTE_ALERT_FAILED = 'Could not share';

export type ShareCustomerQuoteResult =
  | { ok: true; kind: 'pdf' | 'html' }
  | { ok: false; reason: 'empty' | 'unavailable' | 'failed' | 'cancelled'; message: string };

export type ShareCustomerQuoteDeps = {
  printToPdf: (html: string) => Promise<{ uri: string }>;
  sharingAvailable: () => Promise<boolean>;
  shareFile: (
    uri: string,
    options: { mimeType: string; dialogTitle: string; UTI?: string },
  ) => Promise<void>;
  cacheDirectory: string | null;
  writeTextFile: (uri: string, contents: string) => Promise<void>;
  copyFile: (from: string, to: string) => Promise<void>;
};

export function defaultShareCustomerQuoteDeps(): ShareCustomerQuoteDeps {
  return {
    printToPdf: (html) => Print.printToFileAsync({ html }),
    sharingAvailable: () => Sharing.isAvailableAsync(),
    shareFile: (uri, options) => Sharing.shareAsync(uri, options),
    cacheDirectory: FileSystem.cacheDirectory,
    writeTextFile: (uri, contents) => FileSystem.writeAsStringAsync(uri, contents),
    copyFile: (from, to) => FileSystem.copyAsync({ from, to }),
  };
}

export function hasCustomerFacingLines(
  lineItems: { optionRole?: string | null }[] | null | undefined,
): boolean {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return false;
  }
  return lineItems.some((item) => item.optionRole !== 'alt');
}

/** iOS / Expo share-sheet cancel messages. Share-API failures are `failed`. */
export function classifyShareError(error: unknown): 'cancelled' | 'failed' {
  const lower = shareErrorText(error).toLowerCase();
  if (
    lower.includes('cancel')
    || lower.includes('dismiss')
    || lower.includes('did not share')
    || lower.includes('user did not')
    || /\b3072\b/.test(lower)
  ) {
    return 'cancelled';
  }
  return 'failed';
}

function shareErrorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`;
  }
  if (error && typeof error === 'object') {
    const rec = error as { name?: unknown; message?: unknown; code?: unknown };
    return [rec.name, rec.message, rec.code].filter((part) => part != null && part !== '').join(' ');
  }
  return String(error ?? '');
}

export function resultFromShareError(error: unknown): Extract<
  ShareCustomerQuoteResult,
  { ok: false }
> {
  const reason = classifyShareError(error);
  return {
    ok: false,
    reason,
    message: reason === 'cancelled' ? SHARE_QUOTE_CANCELLED : SHARE_QUOTE_FAILED,
  };
}

export function alertForFailedShare(
  result: Extract<ShareCustomerQuoteResult, { ok: false }>,
): { title: string; message: string } {
  if (result.reason === 'empty') {
    return { title: SHARE_QUOTE_ALERT_CANNOT, message: result.message };
  }
  if (result.reason === 'cancelled') {
    return { title: SHARE_QUOTE_ALERT_CANCELLED, message: result.message };
  }
  return { title: SHARE_QUOTE_ALERT_FAILED, message: result.message };
}

export async function shareCustomerQuote(
  source: CustomerQuoteSource,
  brand: CustomerDocumentBrand = {},
  deps: ShareCustomerQuoteDeps = defaultShareCustomerQuoteDeps(),
): Promise<ShareCustomerQuoteResult> {
  const lineItems = Array.isArray(source.lineItems) ? source.lineItems : [];
  const payload = toCustomerQuotePayload({ ...source, lineItems });
  if (payload.lineItems.length === 0) {
    return { ok: false, reason: 'empty', message: SHARE_QUOTE_EMPTY };
  }

  const available = await deps.sharingAvailable();
  if (!available) {
    return { ok: false, reason: 'unavailable', message: SHARE_QUOTE_UNAVAILABLE };
  }

  const doc = customerQuoteToDocument(payload, brand);
  const cache = deps.cacheDirectory;

  try {
    const printed = await deps.printToPdf(doc.html);
    const shareUri = await namedCopy(
      printed.uri,
      cache,
      CUSTOMER_QUOTE_FILENAME_PDF,
      deps,
    );
    try {
      await deps.shareFile(shareUri, {
        mimeType: 'application/pdf',
        dialogTitle: SHARE_QUOTE_LABEL,
        UTI: 'com.adobe.pdf',
      });
      return { ok: true, kind: 'pdf' };
    } catch (shareError) {
      // Share sheet was shown — do not open a second HTML sheet, and do not
      // treat cancel/fail as success (mark-sent must not run).
      return resultFromShareError(shareError);
    }
  } catch {
    if (!cache) {
      return { ok: false, reason: 'failed', message: SHARE_QUOTE_FAILED };
    }
    const htmlUri = `${cache}${CUSTOMER_QUOTE_FILENAME_HTML}`;
    try {
      await deps.writeTextFile(htmlUri, doc.html);
    } catch {
      return { ok: false, reason: 'failed', message: SHARE_QUOTE_FAILED };
    }
    try {
      await deps.shareFile(htmlUri, {
        mimeType: 'text/html',
        dialogTitle: SHARE_QUOTE_LABEL,
        UTI: 'public.html',
      });
      return { ok: true, kind: 'html' };
    } catch (shareError) {
      return resultFromShareError(shareError);
    }
  }
}

async function namedCopy(
  from: string,
  cache: string | null,
  filename: string,
  deps: ShareCustomerQuoteDeps,
): Promise<string> {
  if (!cache) {
    return from;
  }
  const to = `${cache}${filename}`;
  try {
    await deps.copyFile(from, to);
    return to;
  } catch {
    return from;
  }
}
