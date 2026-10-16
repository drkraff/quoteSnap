import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DELETE_VOICE_LINE_ITEMS_SQL,
  INSERT_VOICE_LINE_ITEM_SQL,
  LOCK_CURRENT_VOICE_JOB_SQL,
  replaceVoiceQuoteLines,
  UPDATE_VOICE_QUOTE_RESULT_SQL,
} from "./commit-voice-result.js";

const CLIENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const JOB_ID = "job-current";

function recordingClient(calls: Array<{ sql: string; params: unknown[] | undefined }>) {
  return {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql === LOCK_CURRENT_VOICE_JOB_SQL) {
        return { rows: [{ id: params?.[0] }] };
      }
      return { rows: [] };
    },
  };
}

function assertInsertParams(actual: unknown[] | undefined, expectedPrefix: unknown[]): void {
  assert.ok(actual);
  assert.deepEqual(actual.slice(0, -1), expectedPrefix);
  assert.match(String(actual.at(-1)), CLIENT_UUID_RE);
}

describe("replaceVoiceQuoteLines", () => {
  it("deletes existing lines then inserts and sets draft_local without a failure stage", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    await replaceVoiceQuoteLines(
      recordingClient(calls),
      {
        quoteId: "quote-1",
        jobId: JOB_ID,
        status: "draft_local",
        totalCents: 1500,
        failureStage: "mapping",
        lineItems: [
          {
            catalogItemId: "cat-1",
            name: "Pipe",
            quantity: 2,
            unit: "foot",
            unitPriceCents: 750,
            confidence: 0.9,
            priceSource: "catalog",
          },
        ],
      },
    );

    assert.equal(calls[0]!.sql, LOCK_CURRENT_VOICE_JOB_SQL);
    assert.deepEqual(calls[0]!.params, ["quote-1", JOB_ID]);
    assert.equal(calls[1]!.sql, DELETE_VOICE_LINE_ITEMS_SQL);
    assert.deepEqual(calls[1]!.params, ["quote-1"]);
    assert.equal(calls[2]!.sql, INSERT_VOICE_LINE_ITEM_SQL);
    assertInsertParams(calls[2]!.params, [
      "quote-1",
      "cat-1",
      "Pipe",
      2,
      750,
      0.9,
      "foot",
      "catalog",
      null,
    ]);
    assert.equal(calls[3]!.sql, UPDATE_VOICE_QUOTE_RESULT_SQL);
    assert.deepEqual(calls[3]!.params, ["draft_local", 1500, null, null, null, null, "quote-1", JOB_ID]);
    assert.match(UPDATE_VOICE_QUOTE_RESULT_SQL, /exclusions = COALESCE\(\$5, exclusions\)/);
    assert.match(UPDATE_VOICE_QUOTE_RESULT_SQL, /voice_job_id = \$8/);
    assert.match(UPDATE_VOICE_QUOTE_RESULT_SQL, /status = 'ai_processing'/);
    assert.equal(UPDATE_VOICE_QUOTE_RESULT_SQL.includes("'sent'"), false);
  });

  it("writes ai_failed + mapping stage for a partial FAIL-05 draft and stores 0 cents for blank prices", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    await replaceVoiceQuoteLines(
      recordingClient(calls),
      {
        quoteId: "quote-2",
        jobId: JOB_ID,
        status: "ai_failed",
        totalCents: 0,
        failureStage: "mapping",
        lineItems: [
          {
            catalogItemId: null,
            name: "Mystery work",
            quantity: 1,
            unit: "job",
            unitPriceCents: null,
            confidence: 0.59,
            priceSource: "unknown",
          },
        ],
      },
    );

    assertInsertParams(calls[2]!.params, [
      "quote-2",
      null,
      "Mystery work",
      1,
      0,
      0.59,
      "job",
      "unknown",
      null,
    ]);
    assert.deepEqual(calls[3]!.params, ["ai_failed", 0, "mapping", null, null, null, "quote-2", JOB_ID]);
  });

  it("writes joined extract assumptions into client_sentence", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    await replaceVoiceQuoteLines(
      recordingClient(calls),
      {
        quoteId: "quote-3",
        jobId: JOB_ID,
        status: "draft_local",
        totalCents: 0,
        failureStage: null,
        clientSentence: "appliances not included",
        lineItems: [],
      },
    );
    assert.equal(calls[1]!.sql, DELETE_VOICE_LINE_ITEMS_SQL);
    assert.equal(calls[2]!.sql, UPDATE_VOICE_QUOTE_RESULT_SQL);
    assert.deepEqual(calls[2]!.params, [
      "draft_local",
      0,
      null,
      "appliances not included",
      null,
      null,
      "quote-3",
      JOB_ID,
    ]);
  });

  it("writes spoken exclusions onto exclusions and keeps the note", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    await replaceVoiceQuoteLines(
      recordingClient(calls),
      {
        quoteId: "quote-excl",
        jobId: JOB_ID,
        status: "draft_local",
        totalCents: 8000,
        failureStage: null,
        clientSentence: "Replace the outlet.",
        exclusions: "permit not included",
        lineItems: [],
      },
    );
    assert.match(UPDATE_VOICE_QUOTE_RESULT_SQL, /exclusions = COALESCE\(\$5, exclusions\)/);
    assert.equal(calls[0]!.sql, LOCK_CURRENT_VOICE_JOB_SQL);
    assert.deepEqual(calls[2]!.params, [
      "draft_local",
      8000,
      null,
      "Replace the outlet.",
      "permit not included",
      null,
      "quote-excl",
      JOB_ID,
    ]);
  });

  it("writes extracted rooms JSON and line room_id without inventing a price", async () => {
    const kitchenId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const roomsJson = JSON.stringify([{ id: kitchenId, name: "Kitchen", privateNote: null }]);
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    await replaceVoiceQuoteLines(
      recordingClient(calls),
      {
        quoteId: "quote-4",
        jobId: JOB_ID,
        status: "draft_local",
        totalCents: 0,
        failureStage: null,
        roomsJson,
        lineItems: [
          {
            catalogItemId: null,
            name: "Cabinets",
            quantity: 14,
            unit: "foot",
            unitPriceCents: null,
            confidence: 0.8,
            priceSource: "unknown",
            roomId: kitchenId,
          },
        ],
      },
    );
    assertInsertParams(calls[2]!.params, [
      "quote-4",
      null,
      "Cabinets",
      14,
      0,
      0.8,
      "foot",
      "unknown",
      kitchenId,
    ]);
    assert.deepEqual(calls[3]!.params, [
      "draft_local",
      0,
      null,
      null,
      null,
      roomsJson,
      "quote-4",
      JOB_ID,
    ]);
  });

  it("persists attach price_source on adhoc lines (spoken, learned, computed, unknown)", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    await replaceVoiceQuoteLines(
      recordingClient(calls),
      {
        quoteId: "quote-5",
        jobId: JOB_ID,
        status: "draft_local",
        totalCents: 2535900,
        failureStage: null,
        lineItems: [
          {
            catalogItemId: null,
            name: "Tear-out",
            quantity: 1,
            unit: "job",
            unitPriceCents: 900,
            confidence: 0.9,
            priceSource: "spoken",
          },
          {
            catalogItemId: null,
            name: "Laminate cabinets",
            quantity: 14,
            unit: "foot",
            unitPriceCents: 180000,
            confidence: 0.8,
            priceSource: "learned",
          },
          {
            catalogItemId: null,
            name: "Labor",
            quantity: 2,
            unit: "hour",
            unitPriceCents: 7500,
            confidence: 0.8,
            priceSource: "computed",
          },
          {
            catalogItemId: null,
            name: "Mystery assembly",
            quantity: 1,
            unit: "job",
            unitPriceCents: null,
            confidence: 0.4,
            priceSource: "unknown",
          },
        ],
      },
    );

    const inserts = calls.filter((c) => c.sql === INSERT_VOICE_LINE_ITEM_SQL);
    assert.equal(inserts.length, 4);
    assert.deepEqual(
      inserts.map((c) => ({
        catalogItemId: c.params?.[1],
        name: c.params?.[2],
        cents: c.params?.[4],
        priceSource: c.params?.[7],
      })),
      [
        { catalogItemId: null, name: "Tear-out", cents: 900, priceSource: "spoken" },
        { catalogItemId: null, name: "Laminate cabinets", cents: 180000, priceSource: "learned" },
        { catalogItemId: null, name: "Labor", cents: 7500, priceSource: "computed" },
        { catalogItemId: null, name: "Mystery assembly", cents: 0, priceSource: "unknown" },
      ],
    );
  });

  it("discards a stale job without deleting the newer draft's lines", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const committed = await replaceVoiceQuoteLines(
      {
        query: async (sql, params) => {
          calls.push({ sql, params });
          return { rows: [] };
        },
      },
      {
        quoteId: "quote-sent",
        jobId: "job-old",
        status: "draft_local",
        totalCents: 8000,
        failureStage: null,
        lineItems: [
          {
            catalogItemId: null,
            name: "Outlet",
            quantity: 1,
            unit: "each",
            unitPriceCents: 8000,
            confidence: 0.9,
          },
        ],
      },
    );

    assert.equal(committed, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.sql, LOCK_CURRENT_VOICE_JOB_SQL);
    assert.deepEqual(calls[0]!.params, ["quote-sent", "job-old"]);
    assert.equal(calls.some((call) => call.sql === DELETE_VOICE_LINE_ITEMS_SQL), false);
  });

  it("discards a blank job id without touching the quote", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const committed = await replaceVoiceQuoteLines(
      {
        query: async (sql, params) => {
          calls.push({ sql, params });
          return { rows: [{ id: "quote-1" }] };
        },
      },
      {
        quoteId: "quote-1",
        jobId: "   ",
        status: "draft_local",
        totalCents: 0,
        failureStage: null,
        lineItems: [],
      },
    );
    assert.equal(committed, false);
    assert.equal(calls.length, 0);
  });
});
