import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseQuoteServerId,
  resolveVoiceUploadQuote,
  type VoiceUploadQueryFn,
} from "./upload-quote.js";

const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_QUOTE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("parseQuoteServerId", () => {
  it("treats omitted, null, and blank as create", () => {
    assert.deepEqual(parseQuoteServerId(undefined), { ok: true, quoteServerId: null });
    assert.deepEqual(parseQuoteServerId(null), { ok: true, quoteServerId: null });
    assert.deepEqual(parseQuoteServerId(""), { ok: true, quoteServerId: null });
    assert.deepEqual(parseQuoteServerId("   "), { ok: true, quoteServerId: null });
  });

  it("accepts a UUID (case-insensitive) and trims it", () => {
    assert.deepEqual(parseQuoteServerId(`  ${QUOTE_ID}  `), {
      ok: true,
      quoteServerId: QUOTE_ID,
    });
    assert.deepEqual(parseQuoteServerId(QUOTE_ID.toUpperCase()), {
      ok: true,
      quoteServerId: QUOTE_ID.toUpperCase(),
    });
  });

  it("takes the first value when multer duplicates the field", () => {
    assert.deepEqual(parseQuoteServerId([QUOTE_ID, OTHER_QUOTE]), {
      ok: true,
      quoteServerId: QUOTE_ID,
    });
  });

  it("rejects a non-UUID string so Postgres uuid params never see junk", () => {
    assert.deepEqual(parseQuoteServerId("not-a-uuid"), {
      ok: false,
      error: "quoteServerId must be a UUID",
    });
    assert.deepEqual(parseQuoteServerId("quote-server-1"), {
      ok: false,
      error: "quoteServerId must be a UUID",
    });
    assert.deepEqual(parseQuoteServerId(12), {
      ok: false,
      error: "quoteServerId must be a UUID",
    });
  });
});

describe("resolveVoiceUploadQuote", () => {
  it("INSERTs a new ai_processing quote when quoteServerId is absent", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const runQuery: VoiceUploadQueryFn = async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: QUOTE_ID }] };
    };

    const result = await resolveVoiceUploadQuote(runQuery, CONTRACTOR_ID, null);

    assert.deepEqual(result, { ok: true, quoteId: QUOTE_ID, created: true });
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.sql, /INSERT INTO quotes/);
    assert.match(calls[0]!.sql, /'ai_processing'/);
    assert.deepEqual(calls[0]!.params, [CONTRACTOR_ID]);
  });

  it("reuses a tenant-owned quote instead of INSERT", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const runQuery: VoiceUploadQueryFn = async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id FROM quotes")) {
        return { rows: [{ id: QUOTE_ID }] };
      }
      return { rows: [] };
    };

    const result = await resolveVoiceUploadQuote(runQuery, CONTRACTOR_ID, QUOTE_ID);

    assert.deepEqual(result, { ok: true, quoteId: QUOTE_ID, created: false });
    assert.equal(calls.length, 2);
    assert.match(calls[0]!.sql, /SELECT id FROM quotes WHERE id = \$1 AND contractor_id = \$2/);
    assert.deepEqual(calls[0]!.params, [QUOTE_ID, CONTRACTOR_ID]);
    assert.match(calls[1]!.sql, /UPDATE quotes SET status = 'ai_processing'/);
    assert.deepEqual(calls[1]!.params, [QUOTE_ID, CONTRACTOR_ID]);
    assert.equal(
      calls.some((call) => call.sql.includes("INSERT INTO quotes")),
      false,
    );
  });

  it("returns 404 when the UUID is missing or belongs to another contractor", async () => {
    const runQuery: VoiceUploadQueryFn = async () => ({ rows: [] });

    const result = await resolveVoiceUploadQuote(runQuery, CONTRACTOR_ID, QUOTE_ID);

    assert.deepEqual(result, { ok: false, status: 404, error: "Quote not found" });
  });
});
