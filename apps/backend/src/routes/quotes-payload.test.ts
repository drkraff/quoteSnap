import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LIST_ACTIVE_QUOTES_SQL,
  LIST_ARCHIVED_QUOTES_SQL,
  lineItemRowToResponse,
  nestLineItems,
  parseQuotesListArchivedQuery,
  quoteRowToResponse,
  type QuoteLineItemRow,
  type QuoteRow,
} from "./quotes-payload.js";
import { filterUuidCatalogIds } from "../workers/voice-validation.js";
import { toCustomerQuotePayload } from "../quotes/customer-payload.js";

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
    is_archived: false,
    private_note: null,
    client_sentence: null,
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
    unit: "foot",
    private_note: null,
    price_source: "catalog",
    option_group_id: null,
    option_role: null,
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
      isArchived: false,
      privateNote: null,
      clientSentence: null,
    });
  });

  it("maps a null voice_job_id to null, not omit", () => {
    assert.equal(quoteRowToResponse(quoteRow()).voiceJobId, null);
  });

  it("maps is_archived so hydrate can hide archived quotes", () => {
    assert.equal(quoteRowToResponse(quoteRow()).isArchived, false);
    assert.equal(quoteRowToResponse(quoteRow({ is_archived: true })).isArchived, true);
  });

  it("maps private_note for contractor hydrate (not a customer payload)", () => {
    assert.equal(quoteRowToResponse(quoteRow()).privateNote, null);
    assert.equal(
      quoteRowToResponse(quoteRow({ private_note: "subcontractor check" })).privateNote,
      "subcontractor check",
    );
  });

  it("maps client_sentence for contractor hydrate and the customer allowlist", () => {
    assert.equal(quoteRowToResponse(quoteRow()).clientSentence, null);
    assert.equal(
      quoteRowToResponse(
        quoteRow({ client_sentence: "Appliances and decorative lighting not included." }),
      ).clientSentence,
      "Appliances and decorative lighting not included.",
    );
  });
});

describe("lineItemRowToResponse", () => {
  it("keeps confidence and catalogItemId for draft reconstruction", () => {
    assert.deepEqual(lineItemRowToResponse(lineItemRow()), {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Copper pipe",
      quantity: 2,
      unitPriceCents: 1500,
      unit: "foot",
      confidence: 0.91,
      catalogItemId: "33333333-3333-4333-8333-333333333333",
      privateNote: null,
      priceSource: "catalog",
      optionGroupId: null,
      optionRole: null,
    });
  });

  it("maps a contractor line private_note so hydrate can restore it", () => {
    assert.equal(
      lineItemRowToResponse(lineItemRow({ private_note: "moisture from neighbor" })).privateNote,
      "moisture from neighbor",
    );
  });

  it("maps stored price_source and infers known/unknown on pre-migration null", () => {
    assert.equal(lineItemRowToResponse(lineItemRow()).priceSource, "catalog");
    assert.equal(
      lineItemRowToResponse(lineItemRow({ price_source: "spoken", unit_price_cents: 850 })).priceSource,
      "spoken",
    );
    assert.equal(
      lineItemRowToResponse(lineItemRow({ price_source: "computed", unit_price_cents: 7500 })).priceSource,
      "computed",
    );
    assert.equal(
      lineItemRowToResponse(lineItemRow({ price_source: null, unit_price_cents: 1500 })).priceSource,
      "known",
    );
    assert.equal(
      lineItemRowToResponse(lineItemRow({ price_source: null, unit_price_cents: 0 })).priceSource,
      "unknown",
    );
  });

  it("maps option_group_id and option_role for a thin base+alt pair", () => {
    const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const mapped = lineItemRowToResponse(
      lineItemRow({ option_group_id: groupId, option_role: "alt" }),
    );
    assert.equal(mapped.optionGroupId, groupId);
    assert.equal(mapped.optionRole, "alt");
    assert.equal(lineItemRowToResponse(lineItemRow()).optionGroupId, null);
    assert.equal(lineItemRowToResponse(lineItemRow()).optionRole, null);
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

describe("contractor response vs customer payload", () => {
  it("keeps private notes on the contractor mapper and drops them on the customer allowlist", () => {
    const quote = quoteRowToResponse(
      quoteRow({
        private_note: "subcontractor check — do not tell the client",
        client_sentence: "Appliances not included.",
      }),
    );
    const line = lineItemRowToResponse(
      lineItemRow({ private_note: "moisture from neighbor pipe" }),
    );
    assert.equal(quote.privateNote, "subcontractor check — do not tell the client");
    assert.equal(quote.clientSentence, "Appliances not included.");
    assert.equal(line.privateNote, "moisture from neighbor pipe");

    const customer = toCustomerQuotePayload({
      customerPhone: quote.customerPhone,
      totalCents: quote.totalCents,
      privateNote: quote.privateNote,
      clientSentence: quote.clientSentence,
      lineItems: [line],
    });
    const json = JSON.stringify(customer);
    assert.equal(json.includes("subcontractor check"), false);
    assert.equal(json.includes("moisture from neighbor"), false);
    assert.equal(json.includes("privateNote"), false);
    assert.equal(customer.clientSentence, "Appliances not included.");
    assert.equal(json.includes("Appliances not included."), true);
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

describe("LIST_ACTIVE_QUOTES_SQL", () => {
  it("excludes archived quotes the same way catalog GET excludes archived SKUs", () => {
    assert.match(LIST_ACTIVE_QUOTES_SQL, /is_archived = FALSE/);
    assert.match(LIST_ACTIVE_QUOTES_SQL, /contractor_id = \$1/);
  });
});

describe("LIST_ARCHIVED_QUOTES_SQL", () => {
  it("returns only archived rows for GET /quotes?archived=true", () => {
    assert.match(LIST_ARCHIVED_QUOTES_SQL, /is_archived = TRUE/);
    assert.match(LIST_ARCHIVED_QUOTES_SQL, /contractor_id = \$1/);
    assert.doesNotMatch(LIST_ARCHIVED_QUOTES_SQL, /is_archived = FALSE/);
  });
});

describe("parseQuotesListArchivedQuery", () => {
  it("defaults to the active list", () => {
    assert.equal(parseQuotesListArchivedQuery(undefined), false);
    assert.equal(parseQuotesListArchivedQuery("false"), false);
    assert.equal(parseQuotesListArchivedQuery("0"), false);
  });

  it("treats true / 1 as the archived list", () => {
    assert.equal(parseQuotesListArchivedQuery("true"), true);
    assert.equal(parseQuotesListArchivedQuery("1"), true);
    assert.equal(parseQuotesListArchivedQuery(true), true);
    assert.equal(parseQuotesListArchivedQuery(["true"]), true);
  });
});
