/**
 * Thin photo → draft line (OCR polish). Reuses photo-on-line attachments.
 *
 * Camera/gallery stills become an adhoc line with a name hint and a **blank
 * price**. Caption/OCR text is a name hint only.
 *
 * TODO(PHOTO-01): wire GPT-4o Vision / OCR into `captionFromStill`. Until
 * then this is a stub — filename stem or "Imported item", never a guessed
 * dollar amount.
 */

import type { LineItem } from '../utils/line-items';
import { addPhoto, newPhotoId, type QuotePhoto } from './photos';

export const IMPORT_FROM_PHOTO_LABEL = 'Import from photo';
export const IMPORTED_ITEM_FALLBACK_NAME = 'Imported item';
export const PHOTO_IMPORT_BLANK_PRICE_HINT =
  'Creates a draft line. Price stays blank until you type it.';
export const NAME_HINT_MAX_LENGTH = 80;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vision/OCR is not wired. Returns null so the name falls back to filename
 * or "Imported item". Do not invent a sell price from pixels.
 *
 * TODO(PHOTO-01): run GPT-4o Vision here and return a caption/OCR string
 * (name hint only). Never parse $ / cents into unitPriceCents.
 */
export function captionFromStill(input: {
  localUri: string;
  mime: string;
  ocrText?: string | null;
}): string | null {
  const wired = input.ocrText;
  if (typeof wired === 'string' && wired.trim() !== '') {
    return wired.trim();
  }
  return null;
}

export function filenameStemFromPicker(
  filenameOrUri: string | null | undefined,
): string | null {
  if (filenameOrUri == null) return null;
  const trimmed = filenameOrUri.trim();
  if (trimmed === '') return null;
  const withoutQuery = trimmed.split('?')[0] ?? trimmed;
  const slash = Math.max(withoutQuery.lastIndexOf('/'), withoutQuery.lastIndexOf('\\'));
  const base = slash >= 0 ? withoutQuery.slice(slash + 1) : withoutQuery;
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base).trim();
  if (stem === '') return null;
  // Dest copies are `{uuid}.jpg` — not a contractor-facing name.
  if (UUID_RE.test(stem)) return null;
  return stem;
}

export function nameHintFromPhoto(input: {
  filename?: string | null;
  caption?: string | null;
}): string {
  const caption = firstHintLine(input.caption);
  if (caption) return caption;
  const fromFile = filenameStemFromPicker(input.filename);
  if (fromFile) return clampHint(fromFile);
  return IMPORTED_ITEM_FALLBACK_NAME;
}

function firstHintLine(caption: string | null | undefined): string | null {
  if (caption == null) return null;
  for (const line of caption.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed !== '') return clampHint(trimmed);
  }
  return null;
}

function clampHint(value: string): string {
  return value.length > NAME_HINT_MAX_LENGTH
    ? value.slice(0, NAME_HINT_MAX_LENGTH)
    : value;
}

/**
 * Adhoc draft line for a picked still. Price is always blank / unknown —
 * callers must not pass cents, and OCR text must not be parsed as money.
 */
export function importedPhotoLine(input: {
  filename?: string | null;
  caption?: string | null;
  clientId?: string;
  roomId?: string | null;
}): LineItem {
  const line: LineItem = {
    catalogItemId: '',
    name: nameHintFromPhoto({
      filename: input.filename,
      caption: input.caption,
    }),
    quantity: 1,
    unitPriceCents: null,
    priceSource: 'unknown',
    clientId: input.clientId && UUID_RE.test(input.clientId) ? input.clientId : newPhotoId(),
  };
  const roomId = input.roomId;
  if (typeof roomId === 'string' && UUID_RE.test(roomId)) {
    line.roomId = roomId;
  }
  return line;
}

export function importLineFromPhoto(input: {
  items: LineItem[];
  photos: QuotePhoto[];
  localUri: string;
  mime: string;
  photoId?: string;
  filename?: string | null;
  /** When Vision is wired, pass OCR/caption text. Stub leaves this unset. */
  caption?: string | null;
  roomId?: string | null;
}): { items: LineItem[]; photos: QuotePhoto[]; line: LineItem } {
  const caption = captionFromStill({
    localUri: input.localUri,
    mime: input.mime,
    ocrText: input.caption,
  });
  const line = importedPhotoLine({
    filename: input.filename,
    caption,
    roomId: input.roomId,
  });
  const photos = addPhoto(input.photos, {
    id: input.photoId,
    localUri: input.localUri,
    mime: input.mime,
    roomId: input.roomId ?? null,
    lineClientId: line.clientId,
  });
  return {
    items: [...input.items, line],
    photos,
    line,
  };
}
