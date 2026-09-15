import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { QuoteLineItemRow, QuoteRow } from "../routes/quotes-payload.js";
import {
  applyQuotePut,
  assertStatusTransition,
  DELETE_LINE_ITEMS_SQL,
  INSERT_LINE_ITEM_SQL,
  parseClientPutQuoteStatus,
  parseClientQuoteStatus,
  parseLineItemInput,
  parseNonNegativeCents,
  parseQuantity,
  parseQuoteCreateBody,
  parseQuotePutBody,
  QUOTE_MONEY_FROZEN_ERROR,
  resolveReplacementLineItems,
  SELECT_QUOTE_FOR_UPDATE_SQL,
  totalCentsFromLineItems,
} from "./quote-write.js";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CONTRACTOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CATALOG_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_CATALOG_ID = "44444444-4444-4444-8444-444444444444";

function quoteRow(overrides: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id: QUOTE_ID,
    contractor_id: CONTRACTOR_ID,
    status: "draft_local",
    customer_phone: null,
    total_cents: 3000,
    created_at: new Date("2026-09-01T12:00:00.000Z"),
    updated_at: new Date("2026-09-01T12:30:00.000Z"),
    sent_at: null,
    voice_job_id: null,
    is_archived: false,
    private_note: null,
    client_sentence: null,
    rooms: [],
    ...overrides,
  };
}

function existingLine(
  overrides: Partial<Pick<QuoteLineItemRow, "name" | "confidence" | "catalog_item_id" | "unit" | "private_note" | "price_source" | "option_group_id" | "option_role" | "room_id" | "client_id">> = {},
): Pick<QuoteLineItemRow, "name" | "confidence" | "catalog_item_id" | "unit" | "private_note" | "price_source" | "option_group_id" | "option_role" | "room_id" | "client_id"> {
  return {
    name: "Copper pipe",
    confidence: 0.91,
    catalog_item_id: CATALOG_ID,
    unit: "foot",
    private_note: null,
    price_source: "catalog",
    option_group_id: null,
    option_role: null,
    room_id: null,
    client_id: null,
    ...overrides,
  };
}

describe("parseClientQuoteStatus", () => {
  it("allows draft_local and draft_queued", () => {
    assert.deepEqual(parseClientQuoteStatus("draft_local"), {
      ok: true,
      status: "draft_local",
    });
    assert.deepEqual(parseClientQuoteStatus("draft_queued"), {
      ok: true,
      status: "draft_queued",
    });
  });

  it("rejects Phase 6 and voice-pipeline statuses so a client cannot self-approve", () => {
    for (const status of [
      "sent",
      "approved",
      "declined",
      "expired",
      "failed_send",
      "ai_processing",
      "ai_failed",
      "nope",
      "",
      1,
      null,
    ]) {
      const parsed = parseClientQuoteStatus(status);
      assert.equal(parsed.ok, false, `expected reject for ${String(status)}`);
      if (!parsed.ok) {
        assert.equal(parsed.error, "status must be draft_local or draft_queued");
      }
    }
  });
});

describe("parseClientPutQuoteStatus", () => {
  it("allows draft_local, draft_queued, and sent (share-without-SMS)", () => {
    assert.deepEqual(parseClientPutQuoteStatus("draft_local"), {
      ok: true,
      status: "draft_local",
    });
    assert.deepEqual(parseClientPutQuoteStatus("draft_queued"), {
      ok: true,
      status: "draft_queued",
    });
    assert.deepEqual(parseClientPutQuoteStatus("sent"), {
      ok: true,
      status: "sent",
    });
  });

  it("still rejects self-approve and voice-pipeline statuses", () => {
    for (const status of [
      "approved",
      "declined",
      "expired",
      "failed_send",
      "ai_processing",
      "ai_failed",
      "nope",
      "",
      1,
      null,
    ]) {
      const parsed = parseClientPutQuoteStatus(status);
      assert.equal(parsed.ok, false, `expected reject for ${String(status)}`);
      if (!parsed.ok) {
        assert.equal(parsed.error, "status must be draft_local, draft_queued, or sent");
      }
    }
  });
});

describe("assertStatusTransition", () => {
  it("allows draft_local ↔ draft_queued", () => {
    assert.deepEqual(assertStatusTransition("draft_local", "draft_queued"), { ok: true });
    assert.deepEqual(assertStatusTransition("draft_queued", "draft_local"), { ok: true });
    assert.deepEqual(assertStatusTransition("draft_local", "draft_local"), { ok: true });
  });

  it("allows recovering ai_failed into a manual draft or queued send (A-10)", () => {
    assert.deepEqual(assertStatusTransition("ai_failed", "draft_local"), { ok: true });
    assert.deepEqual(assertStatusTransition("ai_failed", "draft_queued"), { ok: true });
  });

  it("allows draft_local / draft_queued / ai_failed → sent without a phone (share path)", () => {
    assert.deepEqual(assertStatusTransition("draft_local", "sent"), { ok: true });
    assert.deepEqual(assertStatusTransition("draft_queued", "sent"), { ok: true });
    assert.deepEqual(assertStatusTransition("ai_failed", "sent"), { ok: true });
  });

  it("rejects transitions off ai_processing / sent (voice worker and Phase 6 own those)", () => {
    assert.deepEqual(assertStatusTransition("ai_processing", "draft_local"), {
      ok: false,
      status: 409,
      error: "Quote cannot be updated in its current status",
    });
    assert.deepEqual(assertStatusTransition("sent", "draft_queued"), {
      ok: false,
      status: 409,
      error: "Quote cannot be updated in its current status",
    });
    assert.deepEqual(assertStatusTransition("failed_send", "draft_local"), {
      ok: false,
      status: 409,
      error: "Quote cannot be updated in its current status",
    });
  });
});

describe("parseNonNegativeCents / parseQuantity", () => {
  it("accepts integer cents including 0", () => {
    assert.deepEqual(parseNonNegativeCents(0, "totalCents"), { ok: true, cents: 0 });
    assert.deepEqual(parseNonNegativeCents(1500, "unitPriceCents"), { ok: true, cents: 1500 });
  });

  it("rejects floats, negatives, and non-integers", () => {
    assert.equal(parseNonNegativeCents(10.5, "totalCents").ok, false);
    assert.equal(parseNonNegativeCents(-1, "totalCents").ok, false);
    assert.equal(parseNonNegativeCents("100", "totalCents").ok, false);
    assert.equal(parseNonNegativeCents(null, "totalCents").ok, false);
    assert.equal(parseNonNegativeCents(NaN, "totalCents").ok, false);
  });

  it("requires quantity to be an integer >= 1", () => {
    assert.deepEqual(parseQuantity(1), { ok: true, quantity: 1 });
    assert.equal(parseQuantity(0).ok, false);
    assert.equal(parseQuantity(1.5).ok, false);
    assert.equal(parseQuantity(-2).ok, false);
  });
});

describe("parseQuotePutBody", () => {
  it("rejects empty bodies", () => {
    assert.deepEqual(parseQuotePutBody({}), {
      ok: false,
      error: "At least one field required",
    });
  });

  it("rejects illegal statuses before touching SQL", () => {
    const parsed = parseQuotePutBody({ status: "approved" });
    assert.deepEqual(parsed, {
      ok: false,
      error: "status must be draft_local, draft_queued, or sent",
    });
  });

  it("parses status sent on PUT without requiring customerPhone", () => {
    const parsed = parseQuotePutBody({ status: "sent" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.status, "sent");
    assert.equal(parsed.customerPhone, undefined);
    assert.equal(parsed.lineItems, undefined);
  });

  it("rejects float totalCents", () => {
    const parsed = parseQuotePutBody({ totalCents: 19.99 });
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(parsed.error, "totalCents must be an integer >= 0");
    }
  });

  it("rejects non-array lineItems", () => {
    assert.deepEqual(parseQuotePutBody({ lineItems: { name: "x" } }), {
      ok: false,
      error: "lineItems must be an array",
    });
  });

  it("parses a legal draft_queued status and integer cents", () => {
    const parsed = parseQuotePutBody({
      status: "draft_queued",
      totalCents: 2500,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.status, "draft_queued");
    assert.equal(parsed.totalCents, 2500);
  });

  it("accepts a privateNote-only body (not a money write)", () => {
    const parsed = parseQuotePutBody({ privateNote: "third floor, no elevator" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.privateNote, "third floor, no elevator");
    assert.equal(parsed.lineItems, undefined);
    assert.equal(parsed.totalCents, undefined);
  });

  it("accepts a clientSentence-only body (not a money write)", () => {
    const parsed = parseQuotePutBody({
      clientSentence: "Appliances and decorative lighting not included.",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.clientSentence, "Appliances and decorative lighting not included.");
    assert.equal(parsed.privateNote, undefined);
    assert.equal(parsed.lineItems, undefined);
    assert.equal(parsed.totalCents, undefined);
  });

  it("accepts a rooms-only body (not a money write)", () => {
    const kitchenId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const parsed = parseQuotePutBody({
      rooms: [{ id: kitchenId, name: "Kitchen" }],
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.rooms, [
      { id: kitchenId, name: "Kitchen", privateNote: null },
    ]);
    assert.equal(parsed.lineItems, undefined);
    assert.equal(parsed.totalCents, undefined);
  });
});

describe("parseQuoteCreateBody", () => {
  it("defaults to draft_local and 0 cents", () => {
    assert.deepEqual(parseQuoteCreateBody({}), {
      ok: true,
      status: "draft_local",
      customerPhone: null,
      totalCents: 0,
      privateNote: null,
      clientSentence: null,
    });
  });

  it("rejects Phase 6 status on create", () => {
    const parsed = parseQuoteCreateBody({ status: "sent" });
    assert.equal(parsed.ok, false);
  });

  it("rejects negative totalCents on create", () => {
    const parsed = parseQuoteCreateBody({ totalCents: -5 });
    assert.equal(parsed.ok, false);
  });
});

describe("parseLineItemInput", () => {
  it("accepts a snapshot with integer quantity and cents", () => {
    const parsed = parseLineItemInput({
      name: "  Elbow  ",
      quantity: 2,
      unitPriceCents: 400,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.item.name, "Elbow");
    assert.equal(parsed.item.confidence, undefined);
    assert.equal(parsed.item.catalogItemId, undefined);
  });

  it("accepts null unitPriceCents as unknown (persists 0) and a spoken unit", () => {
    const parsed = parseLineItemInput({
      name: "Laminate cabinets",
      quantity: 14,
      unitPriceCents: null,
      unit: "foot",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.item.unitPriceCents, 0);
    assert.equal(parsed.item.unit, "foot");
    assert.equal(parsed.item.catalogItemId, undefined);
  });

  it("accepts attach priceSource values and rejects a guessed label", () => {
    const spoken = parseLineItemInput({
      name: "Tear-out",
      quantity: 1,
      unitPriceCents: 180000,
      priceSource: "spoken",
    });
    assert.equal(spoken.ok, true);
    if (!spoken.ok) return;
    assert.equal(spoken.item.priceSource, "spoken");

    const computed = parseLineItemInput({
      name: "Labor",
      quantity: 2,
      unitPriceCents: 7500,
      priceSource: "computed",
    });
    assert.equal(computed.ok, true);
    if (!computed.ok) return;
    assert.equal(computed.item.priceSource, "computed");

    assert.equal(
      parseLineItemInput({
        name: "Cabinets",
        quantity: 1,
        unitPriceCents: 100,
        priceSource: "guessed",
      }).ok,
      false,
    );
  });

  it("accepts a thin option pair and rejects a missing role", () => {
    const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const parsed = parseLineItemInput({
      name: "Walk-in shower",
      quantity: 1,
      unitPriceCents: 180000,
      optionGroupId: groupId,
      optionRole: "base",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.item.optionGroupId, groupId);
    assert.equal(parsed.item.optionRole, "base");

    assert.equal(
      parseLineItemInput({
        name: "Keep the tub",
        quantity: 1,
        unitPriceCents: 45000,
        optionGroupId: groupId,
      }).ok,
      false,
    );
    assert.equal(
      parseLineItemInput({
        name: "Keep the tub",
        quantity: 1,
        unitPriceCents: 45000,
        optionRole: "best",
      }).ok,
      false,
    );
  });

  it("accepts a roomId UUID and rejects junk", () => {
    const roomId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const parsed = parseLineItemInput({
      name: "Cabinets",
      quantity: 14,
      unitPriceCents: null,
      roomId,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.item.roomId, roomId);

    assert.equal(
      parseLineItemInput({
        name: "Cabinets",
        quantity: 1,
        unitPriceCents: 0,
        roomId: "kitchen",
      }).ok,
      false,
    );
  });

  it("rejects float unitPriceCents", () => {
    const parsed = parseLineItemInput({
      name: "Elbow",
      quantity: 1,
      unitPriceCents: 4.5,
    });
    assert.equal(parsed.ok, false);
  });

  it("treats confidence null as explicit clear", () => {
    const parsed = parseLineItemInput({
      name: "Elbow",
      quantity: 1,
      unitPriceCents: 400,
      confidence: null,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.item.confidence, null);
  });

  it("rejects confidence outside 0–1", () => {
    assert.equal(
      parseLineItemInput({
        name: "Elbow",
        quantity: 1,
        unitPriceCents: 400,
        confidence: 1.2,
      }).ok,
      false,
    );
  });
});

describe("resolveReplacementLineItems", () => {
  it("preserves confidence and catalog_item_id when the client omits them", () => {
    const resolved = resolveReplacementLineItems(
      [
        {
          name: "Copper pipe",
          quantity: 3,
          unitPriceCents: 1600,
          confidence: undefined,
          catalogItemId: undefined,
        },
      ],
      [existingLine()],
    );
    assert.deepEqual(resolved, [
      {
        name: "Copper pipe",
        quantity: 3,
        unitPriceCents: 1600,
        confidence: 0.91,
        catalogItemId: CATALOG_ID,
        unit: "foot",
        privateNote: null,
        priceSource: "catalog",
        optionGroupId: null,
        optionRole: null,
        roomId: null,
        clientId: null,
      },
    ]);
  });

  it("clears confidence and catalog_item_id when the client sends null", () => {
    const resolved = resolveReplacementLineItems(
      [
        {
          name: "Copper pipe",
          quantity: 2,
          unitPriceCents: 1500,
          confidence: null,
          catalogItemId: null,
        },
      ],
      [existingLine()],
    );
    assert.equal(resolved[0]!.confidence, null);
    assert.equal(resolved[0]!.catalogItemId, null);
  });

  it("uses an explicit confidence when provided", () => {
    const resolved = resolveReplacementLineItems(
      [
        {
          name: "Copper pipe",
          quantity: 1,
          unitPriceCents: 1500,
          confidence: 0.6,
          catalogItemId: undefined,
        },
      ],
      [existingLine()],
    );
    assert.equal(resolved[0]!.confidence, 0.6);
    assert.equal(resolved[0]!.catalogItemId, CATALOG_ID);
  });

  it("ignores a client catalogItemId that does not match an existing snapshot (local Watermelon ids)", () => {
    const resolved = resolveReplacementLineItems(
      [
        {
          name: "Copper pipe",
          quantity: 1,
          unitPriceCents: 1500,
          confidence: undefined,
          catalogItemId: OTHER_CATALOG_ID,
        },
      ],
      [existingLine()],
    );
    assert.equal(resolved[0]!.catalogItemId, CATALOG_ID);
  });

  it("matches duplicate names in order", () => {
    const resolved = resolveReplacementLineItems(
      [
        {
          name: "Elbow",
          quantity: 1,
          unitPriceCents: 100,
          confidence: undefined,
          catalogItemId: undefined,
        },
        {
          name: "Elbow",
          quantity: 2,
          unitPriceCents: 100,
          confidence: undefined,
          catalogItemId: undefined,
        },
      ],
      [
        existingLine({ name: "Elbow", confidence: 0.4, catalog_item_id: CATALOG_ID }),
        existingLine({ name: "Elbow", confidence: 0.8, catalog_item_id: OTHER_CATALOG_ID }),
      ],
    );
    assert.equal(resolved[0]!.confidence, 0.4);
    assert.equal(resolved[0]!.catalogItemId, CATALOG_ID);
    assert.equal(resolved[1]!.confidence, 0.8);
    assert.equal(resolved[1]!.catalogItemId, OTHER_CATALOG_ID);
  });

  it("gives new unmatched items null provenance", () => {
    const resolved = resolveReplacementLineItems(
      [
        {
          name: "Manual add",
          quantity: 1,
          unitPriceCents: 500,
          confidence: undefined,
          catalogItemId: undefined,
        },
      ],
      [existingLine()],
    );
    assert.deepEqual(resolved[0], {
      name: "Manual add",
      quantity: 1,
      unitPriceCents: 500,
      confidence: null,
      catalogItemId: null,
      unit: null,
      privateNote: null,
      priceSource: "known",
      optionGroupId: null,
      optionRole: null,
      roomId: null,
      clientId: null,
    });
  });

  it("recomputes total from resolved quantity × unitPriceCents", () => {
    const resolved = resolveReplacementLineItems(
      [
        {
          name: "A",
          quantity: 2,
          unitPriceCents: 1500,
          confidence: undefined,
          catalogItemId: undefined,
        },
        {
          name: "B",
          quantity: 1,
          unitPriceCents: 400,
          confidence: undefined,
          catalogItemId: undefined,
        },
      ],
      [],
    );
    assert.equal(totalCentsFromLineItems(resolved), 3400);
  });

  it("preserves spoken price_source when the client omits it", () => {
    const resolved = resolveReplacementLineItems(
      [
        {
          name: "Copper pipe",
          quantity: 3,
          unitPriceCents: 1600,
          confidence: undefined,
          catalogItemId: undefined,
        },
      ],
      [existingLine({ price_source: "spoken" })],
    );
    assert.equal(resolved[0]!.priceSource, "spoken");
  });

  it("writes an explicit known source when the contractor types a price", () => {
    const resolved = resolveReplacementLineItems(
      [
        {
          name: "Laminate cabinets",
          quantity: 14,
          unitPriceCents: 180000,
          confidence: undefined,
          catalogItemId: undefined,
          priceSource: "known",
        },
      ],
      [],
    );
    assert.equal(resolved[0]!.priceSource, "known");
  });

  it("infers unknown on a blank unmatched line without inventing a source", () => {
    const resolved = resolveReplacementLineItems(
      [
        {
          name: "Quartz countertop",
          quantity: 12,
          unitPriceCents: 0,
          confidence: undefined,
          catalogItemId: undefined,
        },
      ],
      [],
    );
    assert.equal(resolved[0]!.priceSource, "unknown");
  });

  it("excludes the alt of a pair from the recomputed total (never sums both)", () => {
    const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const resolved = resolveReplacementLineItems(
      [
        {
          name: "Walk-in shower",
          quantity: 1,
          unitPriceCents: 180000,
          confidence: undefined,
          catalogItemId: undefined,
          optionGroupId: groupId,
          optionRole: "base",
        },
        {
          name: "Keep the tub",
          quantity: 1,
          unitPriceCents: 45000,
          confidence: undefined,
          catalogItemId: undefined,
          optionGroupId: groupId,
          optionRole: "alt",
        },
      ],
      [],
    );
    assert.equal(totalCentsFromLineItems(resolved), 180000);
    assert.equal(resolved[0]!.optionRole, "base");
    assert.equal(resolved[1]!.optionRole, "alt");
    assert.equal(resolved[0]!.optionGroupId, groupId);
    assert.equal(resolved[1]!.optionGroupId, groupId);
  });
});

describe("applyQuotePut", () => {
  function mockDb(options: {
    quote?: QuoteRow | null;
    existingLines?: QuoteLineItemRow[];
    failOn?: "insert" | "delete";
  } = {}) {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const quote = options.quote === undefined ? quoteRow() : options.quote;
    const queryFn = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (options.failOn === "delete" && sql === DELETE_LINE_ITEMS_SQL) {
        throw new Error("delete failed");
      }
      if (options.failOn === "insert" && sql === INSERT_LINE_ITEM_SQL) {
        throw new Error("insert failed");
      }
      if (sql === SELECT_QUOTE_FOR_UPDATE_SQL) {
        return { rows: quote ? [quote] : [] };
      }
      if (sql.includes("FROM quote_line_items") && sql.includes("SELECT")) {
        return { rows: options.existingLines ?? [] };
      }
      if (sql.startsWith("UPDATE quotes")) {
        const next = {
          ...(quote as QuoteRow),
          status: (params?.[0] as string) ?? quote!.status,
          total_cents:
            typeof params?.[0] === "number"
              ? (params[0] as number)
              : typeof params?.[1] === "number"
                ? (params[1] as number)
                : quote!.total_cents,
        };
        return { rows: [next] };
      }
      return { rows: [] };
    };
    return { calls, queryFn };
  }

  it("returns 400 without querying when the body is illegal", async () => {
    let queried = false;
    const outcome = await applyQuotePut(
      async () => {
        queried = true;
        return { rows: [] };
      },
      { quoteId: QUOTE_ID, contractorId: CONTRACTOR_ID, body: { status: "approved" } },
    );
    assert.equal(queried, false);
    assert.deepEqual(outcome, {
      status: 400,
      json: { error: "status must be draft_local, draft_queued, or sent" },
    });
  });

  it("scopes the FOR UPDATE select to the JWT contractor", async () => {
    const { calls, queryFn } = mockDb();
    await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: { customerPhone: "+15555550100" },
    });
    assert.equal(calls[0]?.sql, SELECT_QUOTE_FOR_UPDATE_SQL);
    assert.deepEqual(calls[0]?.params, [QUOTE_ID, CONTRACTOR_ID]);

    const other = mockDb();
    await applyQuotePut(other.queryFn, {
      quoteId: QUOTE_ID,
      contractorId: OTHER_CONTRACTOR_ID,
      body: { customerPhone: "+15555550100" },
    });
    assert.deepEqual(other.calls[0]?.params, [QUOTE_ID, OTHER_CONTRACTOR_ID]);
  });

  it("returns 404 when the tenant-scoped select matches no row", async () => {
    const { queryFn } = mockDb({ quote: null });
    const outcome = await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: { status: "draft_queued" },
    });
    assert.deepEqual(outcome, { status: 404, json: { error: "Quote not found" } });
  });

  it("returns 409 when the quote is not in an editable status", async () => {
    const { queryFn, calls } = mockDb({ quote: quoteRow({ status: "ai_processing" }) });
    const outcome = await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: { customerPhone: "+15555550100" },
    });
    assert.deepEqual(outcome, {
      status: 409,
      json: { error: "Quote cannot be updated in its current status" },
    });
    assert.equal(
      calls.some((c) => c.sql === DELETE_LINE_ITEMS_SQL),
      false,
    );
  });

  it("rejects line-item and total mutations on frozen post-send statuses (SYNC-06)", async () => {
    const existing: QuoteLineItemRow[] = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        quote_id: QUOTE_ID,
        name: "Copper pipe",
        quantity: 2,
        unit_price_cents: 1500,
        created_at: new Date("2026-09-01T12:01:00.000Z"),
        confidence: 0.91,
        catalog_item_id: CATALOG_ID,
        unit: "foot",
        private_note: null,
        price_source: "catalog",
        option_group_id: null,
        option_role: null,
        room_id: null,
        client_id: null,
      },
    ];
    for (const status of ["sent", "approved", "declined", "expired", "failed_send"]) {
      const { queryFn, calls } = mockDb({
        quote: quoteRow({ status, total_cents: 3000 }),
        existingLines: existing,
      });
      const outcome = await applyQuotePut(queryFn, {
        quoteId: QUOTE_ID,
        contractorId: CONTRACTOR_ID,
        body: {
          lineItems: [{ name: "Copper pipe", quantity: 9, unitPriceCents: 9999 }],
          totalCents: 1,
        },
      });
      assert.deepEqual(
        outcome,
        { status: 409, json: { error: QUOTE_MONEY_FROZEN_ERROR } },
        `expected freeze 409 for ${status}`,
      );
      assert.equal(
        calls.some((c) => c.sql.startsWith("UPDATE quotes")),
        false,
        `${status} must not UPDATE totals`,
      );
      assert.equal(
        calls.some((c) => c.sql === DELETE_LINE_ITEMS_SQL || c.sql === INSERT_LINE_ITEM_SQL),
        false,
        `${status} must not replace line items`,
      );
      assert.equal(
        calls.some((c) => c.sql.includes("FROM quote_line_items") && c.sql.includes("SELECT")),
        false,
        `${status} must not read lines for replace`,
      );
    }
  });

  it("rejects totalCents-only PUT on sent without touching line items", async () => {
    const { queryFn, calls } = mockDb({ quote: quoteRow({ status: "sent", total_cents: 3000 }) });
    const outcome = await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: { totalCents: 1 },
    });
    assert.deepEqual(outcome, { status: 409, json: { error: QUOTE_MONEY_FROZEN_ERROR } });
    assert.equal(calls.some((c) => c.sql.startsWith("UPDATE quotes")), false);
    assert.equal(calls.some((c) => c.sql === DELETE_LINE_ITEMS_SQL), false);
  });

  it("keeps a generic 409 for non-money PUTs on sent (GET and archive stay separate)", async () => {
    const { queryFn, calls } = mockDb({ quote: quoteRow({ status: "sent" }) });
    const outcome = await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: { customerPhone: "+15555550100" },
    });
    assert.deepEqual(outcome, {
      status: 409,
      json: { error: "Quote cannot be updated in its current status" },
    });
    assert.equal(calls.some((c) => c.sql.startsWith("UPDATE quotes")), false);
  });

  it("marks a draft sent without requiring or inventing customerPhone", async () => {
    for (const status of ["draft_local", "draft_queued", "ai_failed"]) {
      const { queryFn, calls } = mockDb({
        quote: quoteRow({ status, customer_phone: null, sent_at: null }),
      });
      const outcome = await applyQuotePut(queryFn, {
        quoteId: QUOTE_ID,
        contractorId: CONTRACTOR_ID,
        body: { status: "sent" },
      });
      assert.equal(outcome.status, 200, `expected 200 for ${status} → sent`);
      if (outcome.status !== 200) return;
      assert.equal(outcome.json.quote.status, "sent");
      const update = calls.find((c) => c.sql.startsWith("UPDATE quotes"));
      assert.ok(update, `${status} must UPDATE status`);
      assert.match(update!.sql, /status = \$/);
      assert.match(update!.sql, /sent_at = NOW\(\)/);
      assert.equal(update!.params?.[0], "sent");
      assert.equal(
        update!.sql.includes("customer_phone"),
        false,
        `${status} must not invent customer_phone`,
      );
      assert.equal(calls.some((c) => c.sql === DELETE_LINE_ITEMS_SQL), false);
    }
  });

  it("no-ops status→sent on an already-sent quote without rewriting sent_at", async () => {
    const sentAt = new Date("2026-09-01T13:00:00.000Z");
    const { queryFn, calls } = mockDb({
      quote: quoteRow({ status: "sent", sent_at: sentAt, customer_phone: null }),
    });
    const outcome = await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: { status: "sent" },
    });
    assert.equal(outcome.status, 200);
    if (outcome.status !== 200) return;
    assert.equal(outcome.json.quote.status, "sent");
    assert.equal(outcome.json.quote.sentAt, sentAt.toISOString());
    assert.equal(
      calls.some((c) => c.sql.startsWith("UPDATE quotes")),
      false,
      "already-sent share must not UPDATE",
    );
    assert.equal(calls.some((c) => c.sql === DELETE_LINE_ITEMS_SQL), false);
  });

  it("still freezes money writes after a share-sent quote", async () => {
    const { queryFn, calls } = mockDb({
      quote: quoteRow({ status: "sent", sent_at: new Date("2026-09-01T13:00:00.000Z") }),
    });
    const outcome = await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: { status: "sent", totalCents: 1 },
    });
    assert.deepEqual(outcome, { status: 409, json: { error: QUOTE_MONEY_FROZEN_ERROR } });
    assert.equal(calls.some((c) => c.sql.startsWith("UPDATE quotes")), false);
  });

  it("still replaces line items on draft_local and draft_queued", async () => {
    for (const status of ["draft_local", "draft_queued"]) {
      const { queryFn, calls } = mockDb({
        quote: quoteRow({ status, total_cents: 1500 }),
        existingLines: [],
      });
      const outcome = await applyQuotePut(queryFn, {
        quoteId: QUOTE_ID,
        contractorId: CONTRACTOR_ID,
        body: {
          lineItems: [{ name: "Elbow", quantity: 2, unitPriceCents: 400 }],
        },
      });
      assert.equal(outcome.status, 200, `expected 200 for ${status}`);
      assert.equal(calls.some((c) => c.sql === INSERT_LINE_ITEM_SQL), true, `${status} should INSERT`);
    }
  });

  it("allows line-item replace on ai_failed so the contractor can recover (A-10)", async () => {
    const { queryFn, calls } = mockDb({
      quote: quoteRow({ status: "ai_failed", total_cents: 0 }),
      existingLines: [],
    });
    const outcome = await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: {
        status: "draft_local",
        lineItems: [{ name: "Elbow", quantity: 1, unitPriceCents: 400 }],
      },
    });
    assert.equal(outcome.status, 200);
    const update = calls.find((c) => c.sql.startsWith("UPDATE quotes"));
    assert.ok(update);
    assert.match(update!.sql, /status = \$/);
    assert.equal(update!.params?.[0], "draft_local");
    assert.equal(
      calls.some((c) => c.sql === INSERT_LINE_ITEM_SQL),
      true,
    );
  });

  it("replaces line items on one queryFn: UPDATE, DELETE, then INSERT with preserved confidence", async () => {
    const existing: QuoteLineItemRow[] = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        quote_id: QUOTE_ID,
        name: "Copper pipe",
        quantity: 2,
        unit_price_cents: 1500,
        created_at: new Date("2026-09-01T12:01:00.000Z"),
        confidence: 0.91,
        catalog_item_id: CATALOG_ID,
        unit: "foot",
        private_note: null,
        price_source: "catalog",
        option_group_id: null,
        option_role: null,
        room_id: null,
        client_id: null,
      },
    ];
    const { calls, queryFn } = mockDb({ existingLines: existing });
    const outcome = await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: {
        lineItems: [{ name: "Copper pipe", quantity: 3, unitPriceCents: 1500 }],
        totalCents: 999999,
      },
    });

    assert.equal(outcome.status, 200);
    const kinds = calls.map((c) => {
      if (c.sql === SELECT_QUOTE_FOR_UPDATE_SQL) return "select-quote";
      if (c.sql.includes("FROM quote_line_items") && c.sql.includes("SELECT")) return "select-lines";
      if (c.sql.startsWith("UPDATE quotes")) return "update";
      if (c.sql === DELETE_LINE_ITEMS_SQL) return "delete";
      if (c.sql === INSERT_LINE_ITEM_SQL) return "insert";
      return "other";
    });
    assert.deepEqual(kinds, ["select-quote", "select-lines", "update", "delete", "insert"]);

    const update = calls.find((c) => c.sql.startsWith("UPDATE quotes"));
    assert.ok(update);
    assert.match(update!.sql, /total_cents = \$/);
    assert.match(update!.sql, /contractor_id = \$/);
    assert.equal(update!.params?.[0], 4500);

    const insert = calls.find((c) => c.sql === INSERT_LINE_ITEM_SQL);
    assert.deepEqual(insert?.params, [QUOTE_ID, "Copper pipe", 3, 1500, 0.91, CATALOG_ID, "foot", null, "catalog", null, null, null, null]);
  });

  it("issues DELETE before INSERT on the same queryFn so a mid-loop failure can roll back", async () => {
    const { calls, queryFn } = mockDb({
      existingLines: [],
      failOn: "insert",
    });
    await assert.rejects(
      () =>
        applyQuotePut(queryFn, {
          quoteId: QUOTE_ID,
          contractorId: CONTRACTOR_ID,
          body: {
            lineItems: [{ name: "Elbow", quantity: 1, unitPriceCents: 400 }],
          },
        }),
      /insert failed/,
    );
    const deleteAt = calls.findIndex((c) => c.sql === DELETE_LINE_ITEMS_SQL);
    const insertAt = calls.findIndex((c) => c.sql === INSERT_LINE_ITEM_SQL);
    assert.ok(deleteAt >= 0);
    assert.ok(insertAt > deleteAt);
  });

  it("writes explicit null confidence (cleared) on INSERT", async () => {
    const existing: QuoteLineItemRow[] = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        quote_id: QUOTE_ID,
        name: "Copper pipe",
        quantity: 1,
        unit_price_cents: 1500,
        created_at: new Date("2026-09-01T12:01:00.000Z"),
        confidence: 0.91,
        catalog_item_id: CATALOG_ID,
        unit: "foot",
        private_note: null,
        price_source: "catalog",
        option_group_id: null,
        option_role: null,
        room_id: null,
        client_id: null,
      },
    ];
    const { calls, queryFn } = mockDb({ existingLines: existing });
    await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: {
        lineItems: [
          {
            name: "Copper pipe",
            quantity: 1,
            unitPriceCents: 1500,
            confidence: null,
            catalogItemId: null,
          },
        ],
      },
    });
    const insert = calls.find((c) => c.sql === INSERT_LINE_ITEM_SQL);
    assert.deepEqual(insert?.params, [QUOTE_ID, "Copper pipe", 1, 1500, null, null, "foot", null, "catalog", null, null, null, null]);
  });

  it("writes a quote-level privateNote without replacing line items", async () => {
    const { calls, queryFn } = mockDb();
    const outcome = await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: { privateNote: "  subcontractor check  " },
    });
    assert.equal(outcome.status, 200);
    const update = calls.find((c) => c.sql.startsWith("UPDATE quotes"));
    assert.ok(update);
    assert.match(update!.sql, /private_note = \$/);
    assert.equal(update!.params?.[0], "subcontractor check");
    assert.equal(calls.some((c) => c.sql === DELETE_LINE_ITEMS_SQL), false);
    assert.equal(calls.some((c) => c.sql === INSERT_LINE_ITEM_SQL), false);
  });

  it("writes a quote-level clientSentence without replacing line items", async () => {
    const { calls, queryFn } = mockDb();
    const outcome = await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: { clientSentence: "  Appliances not included.  " },
    });
    assert.equal(outcome.status, 200);
    const update = calls.find((c) => c.sql.startsWith("UPDATE quotes"));
    assert.ok(update);
    assert.match(update!.sql, /client_sentence = \$/);
    assert.equal(update!.params?.[0], "Appliances not included.");
    assert.equal(calls.some((c) => c.sql === DELETE_LINE_ITEMS_SQL), false);
    assert.equal(calls.some((c) => c.sql === INSERT_LINE_ITEM_SQL), false);
  });

  it("preserves an existing line private_note when the client omits it", async () => {
    const existing: QuoteLineItemRow[] = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        quote_id: QUOTE_ID,
        name: "Copper pipe",
        quantity: 2,
        unit_price_cents: 1500,
        created_at: new Date("2026-09-01T12:01:00.000Z"),
        confidence: 0.91,
        catalog_item_id: CATALOG_ID,
        unit: "foot",
        private_note: "moisture from neighbor",
        price_source: "catalog",
        option_group_id: null,
        option_role: null,
        room_id: null,
        client_id: null,
      },
    ];
    const { calls, queryFn } = mockDb({ existingLines: existing });
    await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: {
        lineItems: [{ name: "Copper pipe", quantity: 2, unitPriceCents: 1500 }],
      },
    });
    const insert = calls.find((c) => c.sql === INSERT_LINE_ITEM_SQL);
    assert.equal(insert?.params?.[7], "moisture from neighbor");
  });

  it("clears a line private_note when the client sends null", async () => {
    const existing: QuoteLineItemRow[] = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        quote_id: QUOTE_ID,
        name: "Copper pipe",
        quantity: 2,
        unit_price_cents: 1500,
        created_at: new Date("2026-09-01T12:01:00.000Z"),
        confidence: 0.91,
        catalog_item_id: CATALOG_ID,
        unit: "foot",
        private_note: "moisture from neighbor",
        price_source: "catalog",
        option_group_id: null,
        option_role: null,
        room_id: null,
        client_id: null,
      },
    ];
    const { calls, queryFn } = mockDb({ existingLines: existing });
    await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: {
        lineItems: [
          {
            name: "Copper pipe",
            quantity: 2,
            unitPriceCents: 1500,
            privateNote: null,
          },
        ],
      },
    });
    const insert = calls.find((c) => c.sql === INSERT_LINE_ITEM_SQL);
    assert.equal(insert?.params?.[7], null);
  });

  it("persists a base+alt pair and totals the selected (base) option only", async () => {
    const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { calls, queryFn } = mockDb({ existingLines: [] });
    const outcome = await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: {
        lineItems: [
          {
            name: "Walk-in shower",
            quantity: 1,
            unitPriceCents: 180000,
            optionGroupId: groupId,
            optionRole: "base",
          },
          {
            name: "Keep the tub",
            quantity: 1,
            unitPriceCents: 45000,
            optionGroupId: groupId,
            optionRole: "alt",
          },
        ],
      },
    });
    assert.equal(outcome.status, 200);
    const update = calls.find((c) => c.sql.startsWith("UPDATE quotes"));
    assert.equal(update?.params?.[0], 180000);

    const inserts = calls.filter((c) => c.sql === INSERT_LINE_ITEM_SQL);
    assert.equal(inserts.length, 2);
    assert.deepEqual(inserts[0]?.params?.slice(9), [groupId, "base", null, null]);
    assert.deepEqual(inserts[1]?.params?.slice(9), [groupId, "alt", null, null]);
    assert.equal(inserts[0]?.params?.[3], 180000);
    assert.equal(inserts[1]?.params?.[3], 45000);
  });

  it("preserves option group linkage when the client omits it", async () => {
    const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const existing: QuoteLineItemRow[] = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        quote_id: QUOTE_ID,
        name: "Walk-in shower",
        quantity: 1,
        unit_price_cents: 180000,
        created_at: new Date("2026-09-01T12:01:00.000Z"),
        confidence: null,
        catalog_item_id: null,
        unit: null,
        private_note: null,
        price_source: "known",
        option_group_id: groupId,
        option_role: "base",
        room_id: null,
        client_id: null,
      },
    ];
    const { calls, queryFn } = mockDb({ existingLines: existing });
    await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: {
        lineItems: [{ name: "Walk-in shower", quantity: 1, unitPriceCents: 180000 }],
      },
    });
    const insert = calls.find((c) => c.sql === INSERT_LINE_ITEM_SQL);
    assert.deepEqual(insert?.params?.slice(9), [groupId, "base", null, null]);
  });

  it("persists rooms and a line roomId without changing totals", async () => {
    const kitchenId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const { calls, queryFn } = mockDb({ existingLines: [] });
    const outcome = await applyQuotePut(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: {
        rooms: [{ id: kitchenId, name: "Kitchen", privateNote: "don't touch neighbor pipe" }],
        lineItems: [
          {
            name: "Cabinets",
            quantity: 14,
            unitPriceCents: 0,
            roomId: kitchenId,
          },
          {
            name: "Labor",
            quantity: 2,
            unitPriceCents: 7500,
          },
        ],
      },
    });
    assert.equal(outcome.status, 200);
    const update = calls.find((c) => c.sql.startsWith("UPDATE quotes"));
    assert.equal(update?.params?.[0], JSON.stringify([
      { id: kitchenId, name: "Kitchen", privateNote: "don't touch neighbor pipe" },
    ]));
    assert.equal(update?.params?.[1], 15000);

    const inserts = calls.filter((c) => c.sql === INSERT_LINE_ITEM_SQL);
    assert.equal(inserts.length, 2);
    assert.equal(inserts[0]?.params?.[11], kitchenId);
    assert.equal(inserts[1]?.params?.[11], null);
    assert.equal(inserts[0]?.params?.[3], 0);
  });
});
