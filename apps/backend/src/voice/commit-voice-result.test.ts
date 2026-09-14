import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DELETE_VOICE_LINE_ITEMS_SQL,
  INSERT_VOICE_LINE_ITEM_SQL,
  replaceVoiceQuoteLines,
  UPDATE_VOICE_QUOTE_RESULT_SQL,
} from "./commit-voice-result.js";

describe("replaceVoiceQuoteLines", () => {
  it("deletes existing lines then inserts and sets draft_local without a failure stage", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    await replaceVoiceQuoteLines(
      {
        query: async (sql, params) => {
          calls.push({ sql, params });
        },
      },
      {
        quoteId: "quote-1",
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
          },
        ],
      },
    );

    assert.equal(calls[0]!.sql, DELETE_VOICE_LINE_ITEMS_SQL);
    assert.deepEqual(calls[0]!.params, ["quote-1"]);
    assert.equal(calls[1]!.sql, INSERT_VOICE_LINE_ITEM_SQL);
    assert.deepEqual(calls[1]!.params, [
      "quote-1",
      "cat-1",
      "Pipe",
      2,
      750,
      0.9,
      "foot",
    ]);
    assert.equal(calls[2]!.sql, UPDATE_VOICE_QUOTE_RESULT_SQL);
    assert.deepEqual(calls[2]!.params, ["draft_local", 1500, null, "quote-1"]);
  });

  it("writes ai_failed + mapping stage for a partial FAIL-05 draft and stores 0 cents for blank prices", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    await replaceVoiceQuoteLines(
      {
        query: async (sql, params) => {
          calls.push({ sql, params });
        },
      },
      {
        quoteId: "quote-2",
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
          },
        ],
      },
    );

    assert.deepEqual(calls[1]!.params, [
      "quote-2",
      null,
      "Mystery work",
      1,
      0,
      0.59,
      "job",
    ]);
    assert.deepEqual(calls[2]!.params, ["ai_failed", 0, "mapping", "quote-2"]);
  });
});
