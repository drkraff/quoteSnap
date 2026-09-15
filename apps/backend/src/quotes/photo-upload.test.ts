import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { attachQuotePhoto } from "./photo-upload.js";
import { PHOTO_FILE_REQUIRED, PHOTO_MIME_JPEG } from "./photos.js";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ATTACHMENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const jpegFile = {
  buffer: Buffer.from([0xff, 0xd8, 0xff]),
  mimetype: PHOTO_MIME_JPEG,
  size: 3,
};

describe("attachQuotePhoto", () => {
  it("rejects a missing file before touching storage", async () => {
    const queryFn = mock.fn(async () => ({ rows: [] }));
    const outcome = await attachQuotePhoto(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      file: undefined,
      clientId: CLIENT_ID,
      newAttachmentId: ATTACHMENT_ID,
    });
    assert.deepEqual(outcome, { status: 400, json: { error: PHOTO_FILE_REQUIRED } });
    assert.equal(queryFn.mock.calls.length, 0);
  });

  it("returns 409 on frozen post-send quotes and does not insert", async () => {
    const queryFn = mock.fn(async (sql: string) => {
      if (sql.includes("FROM quotes")) {
        return { rows: [{ id: QUOTE_ID, status: "sent" }] };
      }
      return { rows: [] };
    });
    const outcome = await attachQuotePhoto(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      file: jpegFile,
      clientId: CLIENT_ID,
      newAttachmentId: ATTACHMENT_ID,
    });
    assert.equal(outcome.status, 409);
    assert.equal(queryFn.mock.calls.some((c) => String(c.arguments[0]).includes("INSERT")), false);
  });

  it("is idempotent on client_id so a retry does not double-store", async () => {
    const existing = {
      id: ATTACHMENT_ID,
      quote_id: QUOTE_ID,
      contractor_id: CONTRACTOR_ID,
      client_id: CLIENT_ID,
      line_client_id: null,
      room_id: null,
      r2_key: `photos/${CONTRACTOR_ID}/${ATTACHMENT_ID}.jpg`,
      mime: PHOTO_MIME_JPEG,
      created_at: new Date("2026-09-15T00:00:00.000Z"),
    };
    const queryFn = mock.fn(async (sql: string) => {
      if (sql.includes("FROM quotes")) {
        return { rows: [{ id: QUOTE_ID, status: "draft_local" }] };
      }
      if (sql.includes("FROM quote_attachments")) {
        return { rows: [existing] };
      }
      return { rows: [] };
    });
    const outcome = await attachQuotePhoto(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      file: jpegFile,
      clientId: CLIENT_ID,
      newAttachmentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });
    assert.equal(outcome.status, 200);
    if (outcome.status === 200) {
      assert.equal(outcome.json.photo.id, ATTACHMENT_ID);
      assert.equal(outcome.json.photo.clientId, CLIENT_ID);
      assert.equal(outcome.json.photo.uploaded, true);
    }
    assert.equal(queryFn.mock.calls.some((c) => String(c.arguments[0]).includes("INSERT")), false);
  });

  it("uploads to private R2 then inserts metadata without a public URL", async () => {
    const uploaded: string[] = [];
    const inserted = {
      id: ATTACHMENT_ID,
      quote_id: QUOTE_ID,
      contractor_id: CONTRACTOR_ID,
      client_id: CLIENT_ID,
      line_client_id: null,
      room_id: null,
      r2_key: `photos/${CONTRACTOR_ID}/${ATTACHMENT_ID}.jpg`,
      mime: PHOTO_MIME_JPEG,
      created_at: new Date("2026-09-15T00:00:00.000Z"),
    };
    const queryFn = mock.fn(async (sql: string) => {
      if (sql.includes("FROM quotes")) {
        return { rows: [{ id: QUOTE_ID, status: "draft_local" }] };
      }
      if (sql.includes("FROM quote_attachments")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO quote_attachments")) {
        return { rows: [inserted] };
      }
      return { rows: [] };
    });
    const outcome = await attachQuotePhoto(
      queryFn,
      {
        quoteId: QUOTE_ID,
        contractorId: CONTRACTOR_ID,
        file: jpegFile,
        clientId: CLIENT_ID,
        newAttachmentId: ATTACHMENT_ID,
      },
      {
        uploadToR2: async (key, body, mime) => {
          uploaded.push(key, mime, String(body.length));
        },
      },
    );
    assert.equal(outcome.status, 201);
    if (outcome.status === 201) {
      assert.equal(outcome.json.photo.uploaded, true);
      assert.equal("r2Key" in outcome.json.photo, false);
    }
    assert.equal(uploaded[0], `photos/${CONTRACTOR_ID}/${ATTACHMENT_ID}.jpg`);
    assert.equal(uploaded[0]!.startsWith("http"), false);
  });
});
