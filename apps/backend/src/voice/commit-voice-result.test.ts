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
            priceSource: "catalog",
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
      "catalog",
      null,
    ]);
    assert.equal(calls[2]!.sql, UPDATE_VOICE_QUOTE_RESULT_SQL);
    assert.deepEqual(calls[2]!.params, ["draft_local", 1500, null, null, null, "quote-1"]);
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
            priceSource: "unknown",
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
      "unknown",
      null,
    ]);
    assert.deepEqual(calls[2]!.params, ["ai_failed", 0, "mapping", null, null, "quote-2"]);
  });

  it("writes joined extract assumptions into client_sentence", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    await replaceVoiceQuoteLines(
      {
        query: async (sql, params) => {
          calls.push({ sql, params });
        },
      },
      {
        quoteId: "quote-3",
        status: "draft_local",
        totalCents: 0,
        failureStage: null,
        clientSentence: "appliances not included",
        lineItems: [],
      },
    );
    assert.equal(calls[0]!.sql, DELETE_VOICE_LINE_ITEMS_SQL);
    assert.equal(calls[1]!.sql, UPDATE_VOICE_QUOTE_RESULT_SQL);
    assert.deepEqual(calls[1]!.params, [
      "draft_local",
      0,
      null,
      "appliances not included",
      null,
      "quote-3",
    ]);
  });

  it("writes extracted rooms JSON and line room_id without inventing a price", async () => {
    const kitchenId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const roomsJson = JSON.stringify([{ id: kitchenId, name: "Kitchen", privateNote: null }]);
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    await replaceVoiceQuoteLines(
      {
        query: async (sql, params) => {
          calls.push({ sql, params });
        },
      },
      {
        quoteId: "quote-4",
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
    assert.deepEqual(calls[1]!.params, [
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
    assert.deepEqual(calls[2]!.params, [
      "draft_local",
      0,
      null,
      null,
      roomsJson,
      "quote-4",
    ]);
  });
});
