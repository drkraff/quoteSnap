import { uploadToR2 as uploadToR2Default } from "../services/r2.js";
import { isQuoteEditable } from "./quote-write.js";
import {
  ATTACHMENT_COLUMNS,
  PHOTO_FILE_REQUIRED,
  attachmentRowToResponse,
  parsePhotoUploadFields,
  photoR2Key,
  type QuoteAttachmentRow,
  type QuotePhotoResponse,
} from "./photos.js";

export type PhotoUploadQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export type PhotoUploadFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

export type AttachQuotePhotoOutcome =
  | { status: 400 | 404 | 409; json: { error: string } }
  | { status: 201 | 200; json: { photo: QuotePhotoResponse } };

const QUOTE_NOT_FOUND = "Quote not found";
const PHOTO_FROZEN = "Photos cannot be attached after send";

/**
 * Local URI queue → private R2 put → quote_attachments row.
 * Idempotent on (quote_id, client_id) so retries do not double-store.
 */
export async function attachQuotePhoto(
  queryFn: PhotoUploadQueryFn,
  args: {
    quoteId: string;
    contractorId: string;
    file: PhotoUploadFile | undefined;
    clientId: unknown;
    roomId?: unknown;
    lineClientId?: unknown;
    newAttachmentId: string;
  },
  deps: { uploadToR2?: typeof uploadToR2Default } = {},
): Promise<AttachQuotePhotoOutcome> {
  const uploadToR2 = deps.uploadToR2 ?? uploadToR2Default;
  if (!args.file) {
    return { status: 400, json: { error: PHOTO_FILE_REQUIRED } };
  }

  const parsed = parsePhotoUploadFields({
    clientId: args.clientId,
    roomId: args.roomId,
    lineClientId: args.lineClientId,
    mime: args.file.mimetype,
    byteLength: args.file.size,
  });
  if (!parsed.ok) {
    return { status: 400, json: { error: parsed.error } };
  }

  const quoteResult = await queryFn(
    `SELECT id, status FROM quotes WHERE id = $1 AND contractor_id = $2`,
    [args.quoteId, args.contractorId],
  );
  if (quoteResult.rows.length === 0) {
    return { status: 404, json: { error: QUOTE_NOT_FOUND } };
  }
  const quote = quoteResult.rows[0] as { id: string; status: string };
  if (!isQuoteEditable(quote.status)) {
    return { status: 409, json: { error: PHOTO_FROZEN } };
  }

  const existing = await queryFn(
    `SELECT ${ATTACHMENT_COLUMNS}
     FROM quote_attachments
     WHERE quote_id = $1 AND contractor_id = $2 AND client_id = $3`,
    [args.quoteId, args.contractorId, parsed.clientId],
  );
  if (existing.rows.length > 0) {
    return {
      status: 200,
      json: { photo: attachmentRowToResponse(existing.rows[0] as QuoteAttachmentRow) },
    };
  }

  const attachmentId = args.newAttachmentId;
  const r2Key = photoR2Key(args.contractorId, attachmentId, parsed.mime);
  await uploadToR2(r2Key, args.file.buffer, parsed.mime);

  const inserted = await queryFn(
    `INSERT INTO quote_attachments (
       id, quote_id, contractor_id, client_id, line_client_id, room_id, r2_key, mime
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${ATTACHMENT_COLUMNS}`,
    [
      attachmentId,
      args.quoteId,
      args.contractorId,
      parsed.clientId,
      parsed.lineClientId,
      parsed.roomId,
      r2Key,
      parsed.mime,
    ],
  );

  return {
    status: 201,
    json: { photo: attachmentRowToResponse(inserted.rows[0] as QuoteAttachmentRow) },
  };
}
