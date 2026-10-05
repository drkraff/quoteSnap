/**
 * Thin photo-on-line (design §6.1 / §8): stills as contractor-only job
 * evidence. Not public. Never copy into a customer PDF/SMS/approval payload.
 * Never invent a price.
 */

export const PHOTO_MIME_JPEG = "image/jpeg";
export const PHOTO_MIME_PNG = "image/png";
export const PHOTO_MIME_WEBP = "image/webp";

export const ALLOWED_PHOTO_MIMES = [
  PHOTO_MIME_JPEG,
  PHOTO_MIME_PNG,
  PHOTO_MIME_WEBP,
] as const;

export type AllowedPhotoMime = (typeof ALLOWED_PHOTO_MIMES)[number];

export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export const PHOTO_FILE_REQUIRED = "Photo file required";
export const PHOTO_MIME_ERROR = "photo must be a JPEG, PNG, or WebP still";
export const PHOTO_CLIENT_ID_ERROR = "clientId must be a UUID";
export const PHOTO_TOO_LARGE = "photo must be at most 8 MB";
export const PHOTO_BYTES_ERROR = "photo contents do not match a JPEG, PNG, or WebP still";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QuotePhotoResponse = {
  id: string;
  clientId: string;
  mime: string;
  roomId: string | null;
  lineClientId: string | null;
  uploaded: true;
};

export type QuoteAttachmentRow = {
  id: string;
  quote_id: string;
  contractor_id: string;
  client_id: string;
  line_client_id: string | null;
  room_id: string | null;
  r2_key: string;
  mime: string;
  created_at: Date;
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isAllowedPhotoMime(value: unknown): value is AllowedPhotoMime {
  return typeof value === "string" && (ALLOWED_PHOTO_MIMES as readonly string[]).includes(value);
}

export function extensionForPhotoMime(mime: AllowedPhotoMime): "jpg" | "png" | "webp" {
  if (mime === PHOTO_MIME_PNG) return "png";
  if (mime === PHOTO_MIME_WEBP) return "webp";
  return "jpg";
}

export function photoBytesMatchMime(buffer: Buffer, mime: AllowedPhotoMime): boolean {
  if (mime === PHOTO_MIME_JPEG) {
    return buffer.length >= 3
      && buffer[0] === 0xff
      && buffer[1] === 0xd8
      && buffer[2] === 0xff;
  }
  if (mime === PHOTO_MIME_PNG) {
    return buffer.length >= 8
      && buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a;
  }
  return buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

export function photoR2Key(
  contractorId: string,
  attachmentId: string,
  mime: AllowedPhotoMime,
): string {
  if (!isUuid(contractorId) || !isUuid(attachmentId)) {
    throw new Error("invalid photo key");
  }
  return `photos/${contractorId}/${attachmentId}.${extensionForPhotoMime(mime)}`;
}

function parseOptionalUuid(
  value: unknown,
  fieldName: string,
): { ok: true; id: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, id: null };
  }
  if (!isUuid(value)) {
    return { ok: false, error: `${fieldName} must be a UUID or null` };
  }
  return { ok: true, id: value };
}

export type ParsedPhotoUploadFields =
  | { ok: false; error: string }
  | {
      ok: true;
      clientId: string;
      roomId: string | null;
      lineClientId: string | null;
      mime: AllowedPhotoMime;
    };

export function parsePhotoUploadFields(input: {
  clientId: unknown;
  roomId?: unknown;
  lineClientId?: unknown;
  mime: unknown;
  byteLength: number;
}): ParsedPhotoUploadFields {
  if (!isUuid(input.clientId)) {
    return { ok: false, error: PHOTO_CLIENT_ID_ERROR };
  }
  if (!isAllowedPhotoMime(input.mime)) {
    return { ok: false, error: PHOTO_MIME_ERROR };
  }
  if (!Number.isInteger(input.byteLength) || input.byteLength <= 0) {
    return { ok: false, error: PHOTO_FILE_REQUIRED };
  }
  if (input.byteLength > PHOTO_MAX_BYTES) {
    return { ok: false, error: PHOTO_TOO_LARGE };
  }
  const roomId = parseOptionalUuid(input.roomId, "roomId");
  if (!roomId.ok) return roomId;
  const lineClientId = parseOptionalUuid(input.lineClientId, "lineClientId");
  if (!lineClientId.ok) return lineClientId;
  return {
    ok: true,
    clientId: input.clientId,
    roomId: roomId.id,
    lineClientId: lineClientId.id,
    mime: input.mime,
  };
}

export function attachmentRowToResponse(row: QuoteAttachmentRow): QuotePhotoResponse {
  return {
    id: row.id,
    clientId: row.client_id,
    mime: row.mime,
    roomId: row.room_id,
    lineClientId: row.line_client_id,
    uploaded: true,
  };
}

export const ATTACHMENT_COLUMNS =
  "id, quote_id, contractor_id, client_id, line_client_id, room_id, r2_key, mime, created_at";

/** Nest photos under their parent quotes, preserving quote order. Never includes r2_key. */
export function nestPhotos<T extends { id: string }>(
  quotes: T[],
  rows: QuoteAttachmentRow[],
): Array<T & { photos: QuotePhotoResponse[] }> {
  const byQuoteId = new Map<string, QuotePhotoResponse[]>();
  for (const row of rows) {
    const mapped = attachmentRowToResponse(row);
    const list = byQuoteId.get(row.quote_id);
    if (list) {
      list.push(mapped);
    } else {
      byQuoteId.set(row.quote_id, [mapped]);
    }
  }
  return quotes.map((quote) => ({
    ...quote,
    photos: byQuoteId.get(quote.id) ?? [],
  }));
}
