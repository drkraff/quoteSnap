import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  lineItemRowToResponse,
  nestLineItems,
  quoteRowToResponse,
  type QuoteLineItemRow,
  type QuoteRow,
} from "./quotes-payload.js";
import { filterUuidCatalogIds } from "../workers/voice-validation.js";

function quoteRow(overrides: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    contractor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "draft_local",
    customer_phone: null,
    total_cents: 0,
    created_at: new Date("2026-09-01T12:00:00.000Z"),
    updated_at: new Date("2026-09-01T12:30:00.000Z"),
    sent_at: null,
    voice_job_id: null,
    ...overrides,
  };
}

function lineItemRow(overrides: Partial<QuoteLineItemRow> = {}): QuoteLineItemRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    quote_id: "11111111-1111-4111-8111-111111111111",
    name: "Copper pipe",
    quantity: 2,
    unit_price_cents: 1500,
    created_at: new Date("2026-09-01T12:01:00.000Z"),
    confidence: 0.91,
    catalog_item_id: "33333333-3333-4333-8333-333333333333",
    ...overrides,
  };
}

describe("quoteRowToResponse", () => {
  it("includes voiceJobId so a client hydrate can resume polling", () => {
    const row = quoteRow({
      status: "ai_processing",
      voice_job_id: "job-abc",
    });
    assert.deepEqual(quoteRowToResponse(row), {
      id: row.id,
      status: "ai_processing",
      customerPhone: null,
      totalCents: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:30:00.000Z",
      sentAt: null,
      voiceJobId: "job-abc",
    });
  });

  it("maps a null voice_job_id to null, not omit", () => {
    assert.equal(quoteRowToResponse(quoteRow()).voiceJobId, null);
  });
});

describe("lineItemRowToResponse", () => {
  it("keeps confidence and catalogItemId for draft reconstruction", () => {
    assert.deepEqual(lineItemRowToResponse(lineItemRow()), {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Copper pipe",
      quantity: 2,
      unitPriceCents: 1500,
      confidence: 0.91,
      catalogItemId: "33333333-3333-4333-8333-333333333333",
    });
  });
});

describe("nestLineItems", () => {
  it("attaches line items to the matching quote and leaves others empty", () => {
    const q1 = quoteRowToResponse(quoteRow());
    const q2 = quoteRowToResponse(
      quoteRow({
        id: "44444444-4444-4444-8444-444444444444",
        status: "ai_processing",
        voice_job_id: "job-2",
      })
    );
    const nested = nestLineItems(
      [q1, q2],
      [
        lineItemRow(),
        lineItemRow({
          id: "55555555-5555-4555-8555-555555555555",
          name: "Elbow",
          quantity: 1,
          unit_price_cents: 400,
          confidence: 0.5,
          catalog_item_id: null,
        }),
      ]
    );

    assert.equal(nested.length, 2);
    assert.equal(nested[0]!.lineItems.length, 2);
    assert.equal(nested[0]!.lineItems[0]!.name, "Copper pipe");
    assert.equal(nested[0]!.lineItems[1]!.name, "Elbow");
    assert.deepEqual(nested[1]!.lineItems, []);
    assert.equal(nested[1]!.voiceJobId, "job-2");
  });

  it("does not drop quotes when there are no line items", () => {
    const quotes = [quoteRowToResponse(quoteRow())];
    const nested = nestLineItems(quotes, []);
    assert.equal(nested.length, 1);
    assert.deepEqual(nested[0]!.lineItems, []);
  });
});

describe("GET /quotes line-item id filter", () => {
  it("drops non-UUID ids before ANY($1::uuid[])", () => {
    assert.deepEqual(
      filterUuidCatalogIds([
        "11111111-1111-4111-8111-111111111111",
        "not-a-uuid",
        "44444444-4444-4444-8444-444444444444",
      ]),
      ["11111111-1111-4111-8111-111111111111", "44444444-4444-4444-8444-444444444444"]
    );
  });
});
