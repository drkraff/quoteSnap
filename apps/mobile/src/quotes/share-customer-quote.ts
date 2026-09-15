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
export const SHARE_QUOTE_FAILED = 'The quote file could not be created. Try again.';

export type ShareCustomerQuoteResult =
  | { ok: true; kind: 'pdf' | 'html' }
  | { ok: false; reason: 'empty' | 'unavailable' | 'failed'; message: string };

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

export async function shareCustomerQuote(
  source: CustomerQuoteSource,
  brand: CustomerDocumentBrand = {},
  deps: ShareCustomerQuoteDeps = defaultShareCustomerQuoteDeps(),
): Promise<ShareCustomerQuoteResult> {
  const payload = toCustomerQuotePayload(source);
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
    await deps.shareFile(shareUri, {
      mimeType: 'application/pdf',
      dialogTitle: SHARE_QUOTE_LABEL,
      UTI: 'com.adobe.pdf',
    });
    return { ok: true, kind: 'pdf' };
  } catch {
    if (!cache) {
      return { ok: false, reason: 'failed', message: SHARE_QUOTE_FAILED };
    }
    try {
      const htmlUri = `${cache}${CUSTOMER_QUOTE_FILENAME_HTML}`;
      await deps.writeTextFile(htmlUri, doc.html);
      await deps.shareFile(htmlUri, {
        mimeType: 'text/html',
        dialogTitle: SHARE_QUOTE_LABEL,
        UTI: 'public.html',
      });
      return { ok: true, kind: 'html' };
    } catch {
      return { ok: false, reason: 'failed', message: SHARE_QUOTE_FAILED };
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
