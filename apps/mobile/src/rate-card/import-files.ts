/**
 * Old-quote file extract hooks (design §5).
 * Images/PDFs are pickable (up to 3) but OCR is not shipped — paste the lines.
 * Keep in sync with apps/backend/src/rate-card/import-files.ts.
 */

import { MAX_OLD_QUOTE_FILES } from './import-parse';

export const IMAGE_OCR_STUB_REASON = 'image_ocr_stub' as const;
export const PDF_OCR_STUB_REASON = 'pdf_ocr_stub' as const;
export const UNSUPPORTED_FILE_REASON = 'unsupported' as const;
export const EMPTY_DOCUMENT_REASON = 'empty' as const;

export type UnreadableOldQuoteReason =
  | typeof IMAGE_OCR_STUB_REASON
  | typeof PDF_OCR_STUB_REASON
  | typeof UNSUPPORTED_FILE_REASON
  | typeof EMPTY_DOCUMENT_REASON;

export type OldQuoteFileKind = 'text' | 'image' | 'pdf' | 'unsupported';

export type OldQuotePickedFile = {
  uri: string;
  filename: string;
  mime: string;
};

export type OldQuoteDocumentInput = {
  filename?: string;
  mime?: string;
  text?: string;
};

export type ExtractedOldQuoteText =
  | { status: 'text'; text: string; filename: string }
  | { status: 'needs_paste'; reason: UnreadableOldQuoteReason; filename: string };

const TEXT_MIMES = new Set([
  'text/plain',
  'text/csv',
  'text/tab-separated-values',
]);

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function extensionOf(filename: string): string {
  const base = filename.trim().toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot) : '';
}

export function classifyOldQuoteDocument(args: {
  mime?: string;
  filename?: string;
}): OldQuoteFileKind {
  const mime = (args.mime ?? '').trim().toLowerCase();
  const ext = extensionOf(args.filename ?? '');
  if (TEXT_MIMES.has(mime) || ext === '.txt' || ext === '.csv' || ext === '.tsv') {
    return 'text';
  }
  if (mime === 'application/pdf' || ext === '.pdf') {
    return 'pdf';
  }
  if (IMAGE_MIMES.has(mime) || ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(ext)) {
    return 'image';
  }
  return 'unsupported';
}

export function extractTextFromOldQuoteDocument(
  doc: OldQuoteDocumentInput,
): ExtractedOldQuoteText {
  const filename = (doc.filename ?? 'document').trim() || 'document';
  const provided = typeof doc.text === 'string' ? doc.text.trim() : '';
  if (provided !== '') {
    return { status: 'text', text: doc.text as string, filename };
  }

  const kind = classifyOldQuoteDocument({ mime: doc.mime, filename: doc.filename });
  if (kind === 'image') {
    return { status: 'needs_paste', reason: IMAGE_OCR_STUB_REASON, filename };
  }
  if (kind === 'pdf') {
    return { status: 'needs_paste', reason: PDF_OCR_STUB_REASON, filename };
  }
  if (kind === 'text') {
    return { status: 'needs_paste', reason: EMPTY_DOCUMENT_REASON, filename };
  }
  return { status: 'needs_paste', reason: UNSUPPORTED_FILE_REASON, filename };
}

export function capOldQuoteFiles<T>(files: T[]): T[] {
  if (!Array.isArray(files)) {
    return [];
  }
  return files.slice(0, MAX_OLD_QUOTE_FILES);
}

export function mergePickedOldQuoteFiles(
  existing: OldQuotePickedFile[],
  incoming: OldQuotePickedFile[],
): OldQuotePickedFile[] {
  const seen = new Set(existing.map((file) => file.uri));
  const next = [...existing];
  for (const file of incoming) {
    if (seen.has(file.uri)) {
      continue;
    }
    next.push(file);
    seen.add(file.uri);
    if (next.length >= MAX_OLD_QUOTE_FILES) {
      break;
    }
  }
  return capOldQuoteFiles(next);
}

export function oldQuoteFilesNeedPaste(files: OldQuotePickedFile[]): boolean {
  return files.some((file) => extractTextFromOldQuoteDocument(file).status === 'needs_paste');
}

export type ImageLibraryPicker = {
  requestMediaLibraryPermissionsAsync: () => Promise<{ granted: boolean }>;
  launchImageLibraryAsync: (options: {
    mediaTypes: unknown;
    allowsMultipleSelection: boolean;
    selectionLimit: number;
    quality: number;
    exif: boolean;
  }) => Promise<{
    canceled: boolean;
    assets?: { uri?: string; fileName?: string | null; mimeType?: string | null }[];
  }>;
  MediaTypeOptions: { Images: unknown };
};

export const PHOTO_PERMISSION_DENIED = 'photo_permission_denied' as const;
export const PHOTO_PICKER_CANCELED = 'canceled' as const;

export async function pickOldQuoteImages(
  picker: ImageLibraryPicker,
  alreadyPickedCount = 0,
): Promise<
  | { ok: true; files: OldQuotePickedFile[] }
  | { ok: false; reason: typeof PHOTO_PERMISSION_DENIED | typeof PHOTO_PICKER_CANCELED }
> {
  const remaining = Math.max(0, MAX_OLD_QUOTE_FILES - alreadyPickedCount);
  if (remaining === 0) {
    return { ok: true, files: [] };
  }
  const permission = await picker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { ok: false, reason: PHOTO_PERMISSION_DENIED };
  }
  const result = await picker.launchImageLibraryAsync({
    mediaTypes: picker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 0.7,
    exif: false,
  });
  if (result.canceled) {
    return { ok: false, reason: PHOTO_PICKER_CANCELED };
  }
  const files: OldQuotePickedFile[] = [];
  for (const asset of result.assets ?? []) {
    if (!asset.uri) {
      continue;
    }
    files.push({
      uri: asset.uri,
      filename: asset.fileName?.trim() || 'old-quote.jpg',
      mime: asset.mimeType?.trim() || 'image/jpeg',
    });
  }
  return { ok: true, files: capOldQuoteFiles(files) };
}
