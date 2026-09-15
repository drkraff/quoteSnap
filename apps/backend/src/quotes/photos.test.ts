import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_PHOTO_MIMES,
  PHOTO_CLIENT_ID_ERROR,
  PHOTO_FILE_REQUIRED,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_ERROR,
  PHOTO_MIME_JPEG,
  PHOTO_TOO_LARGE,
  attachmentRowToResponse,
  nestPhotos,
  parsePhotoUploadFields,
  photoR2Key,
  type QuoteAttachmentRow,
} from "./photos.js";

const CLIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHOTO_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LINE_CLIENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("parsePhotoUploadFields", () => {
  it("accepts a JPEG still with optional room and line attach", () => {
    const parsed = parsePhotoUploadFields({
      clientId: CLIENT_ID,
      roomId: ROOM_ID,
      lineClientId: LINE_CLIENT,
      mime: PHOTO_MIME_JPEG,
      byteLength: 1200,
    });
    assert.deepEqual(parsed, {
      ok: true,
      clientId: CLIENT_ID,
      roomId: ROOM_ID,
      lineClientId: LINE_CLIENT,
      mime: PHOTO_MIME_JPEG,
    });
  });

  it("rejects missing bytes, oversize, and non-still mimes (no video)", () => {
    assert.equal(
      parsePhotoUploadFields({
        clientId: CLIENT_ID,
        mime: PHOTO_MIME_JPEG,
        byteLength: 0,
      }).ok,
      false,
    );
    assert.equal(
      (parsePhotoUploadFields({
        clientId: CLIENT_ID,
        mime: PHOTO_MIME_JPEG,
        byteLength: 0,
      }) as { error: string }).error,
      PHOTO_FILE_REQUIRED,
    );
    assert.equal(
      (parsePhotoUploadFields({
        clientId: CLIENT_ID,
        mime: PHOTO_MIME_JPEG,
        byteLength: PHOTO_MAX_BYTES + 1,
      }) as { error: string }).error,
      PHOTO_TOO_LARGE,
    );
    assert.equal(
      (parsePhotoUploadFields({
        clientId: CLIENT_ID,
        mime: "video/mp4",
        byteLength: 100,
      }) as { error: string }).error,
      PHOTO_MIME_ERROR,
    );
    assert.equal(
      (parsePhotoUploadFields({
        clientId: "not-a-uuid",
        mime: PHOTO_MIME_JPEG,
        byteLength: 100,
      }) as { error: string }).error,
      PHOTO_CLIENT_ID_ERROR,
    );
  });

  it("clears omitted attach targets (job-level photo)", () => {
    const parsed = parsePhotoUploadFields({
      clientId: CLIENT_ID,
      mime: "image/png",
      byteLength: 10,
    });
    assert.deepEqual(parsed, {
      ok: true,
      clientId: CLIENT_ID,
      roomId: null,
      lineClientId: null,
      mime: "image/png",
    });
  });
});

describe("photoR2Key / attachmentRowToResponse", () => {
  it("stores a private object key, never a public URL, and omits r2_key from GET JSON", () => {
    const key = photoR2Key(CLIENT_ID, PHOTO_ID, PHOTO_MIME_JPEG);
    assert.equal(key, `photos/${CLIENT_ID}/${PHOTO_ID}.jpg`);
    assert.equal(key.includes("http"), false);

    const row: QuoteAttachmentRow = {
      id: PHOTO_ID,
      quote_id: QUOTE_ID,
      contractor_id: CLIENT_ID,
      client_id: CLIENT_ID,
      line_client_id: LINE_CLIENT,
      room_id: ROOM_ID,
      r2_key: key,
      mime: PHOTO_MIME_JPEG,
      created_at: new Date("2026-09-15T00:00:00.000Z"),
    };
    const json = attachmentRowToResponse(row);
    assert.deepEqual(json, {
      id: PHOTO_ID,
      clientId: CLIENT_ID,
      mime: PHOTO_MIME_JPEG,
      roomId: ROOM_ID,
      lineClientId: LINE_CLIENT,
      uploaded: true,
    });
    assert.equal("r2Key" in json, false);
    assert.equal("r2_key" in json, false);
    assert.equal(ALLOWED_PHOTO_MIMES.includes(PHOTO_MIME_JPEG), true);
  });
});

describe("nestPhotos", () => {
  it("nests contractor-only metadata under quotes without leaking r2_key", () => {
    const quotes = [{ id: QUOTE_ID }, { id: "22222222-2222-4222-8222-222222222222" }];
    const rows: QuoteAttachmentRow[] = [
      {
        id: PHOTO_ID,
        quote_id: QUOTE_ID,
        contractor_id: CLIENT_ID,
        client_id: CLIENT_ID,
        line_client_id: null,
        room_id: null,
        r2_key: "photos/secret/key.jpg",
        mime: PHOTO_MIME_JPEG,
        created_at: new Date("2026-09-15T00:00:00.000Z"),
      },
    ];
    const nested = nestPhotos(quotes, rows);
    assert.equal(nested[0]!.photos.length, 1);
    assert.equal(nested[0]!.photos[0]!.id, PHOTO_ID);
    assert.equal(nested[1]!.photos.length, 0);
    assert.equal(JSON.stringify(nested).includes("r2_key"), false);
    assert.equal(JSON.stringify(nested).includes("photos/secret"), false);
  });
});
