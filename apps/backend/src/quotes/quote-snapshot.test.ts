import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { QuoteLineItemRow, QuoteRow } from "../routes/quotes-payload.js";
import {
  customerPayloadHasPrivateNoteKey,
  customerQuotePayloadKeys,
} from "./customer-payload.js";
import {
  INSERT_QUOTE_SNAPSHOT_SQL,
  SELECT_SNAPSHOT_FOR_QUOTE_SQL,
  buildQuoteSnapshotPayload,
  insertQuoteSnapshotOnce,
} from "./quote-snapshot.js";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SECRET_JOB = "subcontractor check — do not tell the client";
const SECRET_LINE = "moisture from neighbor pipe";
const SECRET_ROOM = "access through the locked gate";
const SECRET_PHOTO = "photos/contractor/secret.jpg";

function quote(overrides: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id: QUOTE_ID,
    contractor_id: CONTRACTOR_ID,
    status: "draft_local",
    customer_phone: "+15555550100",
    total_cents: 25000,
    created_at: new Date("2026-10-01T00:00:00.000Z"),
    updated_at: new Date("2026-10-01T00:00:00.000Z"),
    sent_at: null,
    voice_job_id: null,
    is_archived: false,
    private_note: SECRET_JOB,
    client_sentence: "Appliances not included.",
    rooms: [{ id: ROOM_ID, name: "Kitchen", privateNote: SECRET_ROOM }],
    ...overrides,
  };
}

function line(overrides: Partial<QuoteLineItemRow> = {}): QuoteLineItemRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    quote_id: QUOTE_ID,
    name: "Faucet",
    quantity: 1,
    unit_price_cents: 25000,
    created_at: new Date("2026-10-01T00:00:00.000Z"),
    confidence: 0.9,
    catalog_item_id: "33333333-3333-4333-8333-333333333333",
    unit: "each",
    private_note: SECRET_LINE,
    price_source: "catalog",
    option_group_id: null,
    option_role: null,
    room_id: ROOM_ID,
    client_id: "client-line",
    ...overrides,
  };
}

describe("buildQuoteSnapshotPayload", () => {
  it("copies the customer allowlist and drops notes, alts, photos, and blank prices", () => {
    const payload = buildQuoteSnapshotPayload({
      quote: quote(),
      lineItems: [
        line(),
        line({
          id: "44444444-4444-4444-8444-444444444444",
          name: "Keep the tub",
          unit_price_cents: 45000,
          option_group_id: "55555555-5555-4555-8555-555555555555",
          option_role: "alt",
          room_id: null,
        }),
        line({
          id: "66666666-6666-4666-8666-666666666666",
          name: "Quartz countertop",
          unit_price_cents: 0,
          price_source: "unknown",
          private_note: SECRET_LINE,
          room_id: null,
          catalog_item_id: null,
        }),
      ],
    });

    assert.deepEqual(Object.keys(payload).sort(), [...customerQuotePayloadKeys()].sort());
    assert.equal(payload.totalCents, 25000);
    assert.equal(payload.clientSentence, "Appliances not included.");
    assert.equal(payload.lineItems.length, 2);
    assert.equal(payload.lineItems[0]!.name, "Faucet");
    assert.equal(payload.lineItems[0]!.unitPriceCents, 25000);
    assert.equal(payload.lineItems[0]!.roomName, "Kitchen");
    assert.equal(payload.lineItems[1]!.name, "Quartz countertop");
    assert.equal(payload.lineItems[1]!.unitPriceCents, null);
    assert.equal(customerPayloadHasPrivateNoteKey(payload), false);

    const json = JSON.stringify(payload);
    assert.equal(json.includes(SECRET_JOB), false);
    assert.equal(json.includes(SECRET_LINE), false);
    assert.equal(json.includes(SECRET_ROOM), false);
    assert.equal(json.includes(SECRET_PHOTO), false);
    assert.equal(json.includes("Keep the tub"), false);
    assert.equal(json.includes("price_source"), false);
    assert.equal(json.includes("priceSource"), false);
    assert.equal(json.includes("privateNote"), false);
    assert.equal(json.includes("r2"), false);
    assert.equal(json.includes("$"), false);
  });

  it("does not invent a price when every customer line is blank", () => {
    const payload = buildQuoteSnapshotPayload({
      quote: quote({ total_cents: 0, client_sentence: "   ", private_note: SECRET_JOB }),
      lineItems: [line({ name: "Laminate cabinets", unit_price_cents: 0, room_id: null })],
    });
    assert.equal(payload.lineItems[0]!.unitPriceCents, null);
    assert.equal(payload.totalCents, 0);
    assert.equal(payload.clientSentence, null);
  });
});

describe("insertQuoteSnapshotOnce", () => {
  it("inserts once and returns the original payload on a second write", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    let stored: Record<string, unknown> | null = null;
    const firstPayload = buildQuoteSnapshotPayload({
      quote: quote(),
      lineItems: [line()],
    });
    const replacement = buildQuoteSnapshotPayload({
      quote: quote({ total_cents: 99999, private_note: "new secret" }),
      lineItems: [line({ name: "Invented SKU", unit_price_cents: 99999 })],
    });

    const queryFn = async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/UPDATE\s+quote_snapshots/i.test(sql)) {
        throw new Error("quote_snapshots are write-once");
      }
      if (sql === SELECT_SNAPSHOT_FOR_QUOTE_SQL) {
        return { rows: stored ? [{ ...stored }] : [] };
      }
      if (sql === INSERT_QUOTE_SNAPSHOT_SQL) {
        stored = {
          id: "snap-1",
          quote_id: params[0],
          payload: params[2],
          contractor_display_name: params[3],
          contractor_trade: params[4],
          created_at: new Date("2026-10-04T12:00:00.000Z"),
        };
        return { rows: [{ ...stored }] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    };

    const created = await insertQuoteSnapshotOnce(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      payload: firstPayload,
      contractorDisplayName: "Sam",
      contractorTrade: "plumbing",
    });
    assert.equal(created.created, true);
    assert.equal(created.snapshot.payload.lineItems[0]!.unitPriceCents, 25000);

    const again = await insertQuoteSnapshotOnce(queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      payload: replacement,
      contractorDisplayName: "Someone else",
      contractorTrade: "hvac",
    });
    assert.equal(again.created, false);
    assert.equal(again.snapshot.contractorDisplayName, "Sam");
    assert.equal(again.snapshot.contractorTrade, "plumbing");
    assert.equal(again.snapshot.payload.totalCents, 25000);
    assert.equal(again.snapshot.payload.lineItems[0]!.name, "Faucet");
    assert.equal(JSON.stringify(again.snapshot.payload).includes("Invented SKU"), false);
    assert.equal(JSON.stringify(again.snapshot.payload).includes("new secret"), false);

    const inserts = calls.filter((call) => call.sql === INSERT_QUOTE_SNAPSHOT_SQL);
    assert.equal(inserts.length, 1);
    assert.equal(calls.some((call) => /UPDATE\s+quote_snapshots/i.test(call.sql)), false);
    assert.equal(INSERT_QUOTE_SNAPSHOT_SQL.includes("ON CONFLICT"), false);
    assert.equal(INSERT_QUOTE_SNAPSHOT_SQL.includes("UPDATE"), false);
  });
});

describe("021_quote_snapshots.sql", () => {
  it("rejects UPDATE and does not block DELETE cascades", () => {
    const sql = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations/021_quote_snapshots.sql"),
      "utf8",
    );
    assert.match(sql, /CREATE TRIGGER quote_snapshots_write_once/);
    assert.match(sql, /BEFORE UPDATE ON quote_snapshots/);
    assert.match(sql, /quote_snapshots are write-once/);
    assert.doesNotMatch(sql, /BEFORE DELETE/);
    assert.match(sql, /token_hash VARCHAR\(64\) NOT NULL UNIQUE/);
    assert.match(sql, /approved_at/);
    assert.match(sql, /declined_at/);
    assert.equal(sql.includes("fcm_token"), false);
  });
});
