import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { QuoteLineItemRow, QuoteRow } from "../routes/quotes-payload.js";
import { generateApprovalToken, hashApprovalToken } from "./approval-token.js";
import {
  INSERT_QUOTE_SNAPSHOT_SQL,
  SELECT_SNAPSHOT_FOR_QUOTE_SQL,
} from "./quote-snapshot.js";
import type { SmsSender } from "./sms-sender.js";
import {
  INSERT_APPROVAL_TOKEN_SQL,
  MARK_QUOTE_SENT_SQL,
  QUOTE_NOT_SENDABLE_ERROR,
  SELECT_CONTRACTOR_BRAND_SQL,
  SEND_EMPTY_QUOTE_ERROR,
  SEND_PHONE_REQUIRED_ERROR,
  SNAPSHOT_EXISTS_ERROR,
  sendQuoteForApproval,
  sendQuoteJson,
} from "./send-quote.js";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROOM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SECRET_JOB = "subcontractor check — do not tell the client";
const SECRET_LINE = "moisture from neighbor pipe";
const NOW = new Date("2026-10-04T12:00:00.000Z");
const ALREADY_SENT_AT = new Date("2026-10-03T08:00:00.000Z");

function quoteRow(overrides: Partial<QuoteRow> = {}): QuoteRow {
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
    rooms: [{ id: ROOM_ID, name: "Kitchen", privateNote: "locked gate" }],
    ...overrides,
  };
}

function lineRow(overrides: Partial<QuoteLineItemRow> = {}): QuoteLineItemRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    quote_id: QUOTE_ID,
    name: "Faucet",
    quantity: 1,
    unit_price_cents: 25000,
    created_at: new Date("2026-10-01T00:00:00.000Z"),
    confidence: null,
    catalog_item_id: null,
    unit: "each",
    private_note: SECRET_LINE,
    price_source: "catalog",
    option_group_id: null,
    option_role: null,
    room_id: ROOM_ID,
    client_id: null,
    ...overrides,
  };
}

function createDb(options: {
  quote: QuoteRow;
  lines: QuoteLineItemRow[];
  brand?: { display_name: string | null; trade: string | null };
}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let quote = { ...options.quote };
  const lines = options.lines;
  const brand = options.brand ?? { display_name: "  Sam  ", trade: " plumbing " };
  let snapshot: Record<string, unknown> | null = null;
  let tokenHash: string | null = null;

  const queryFn = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/UPDATE\s+quote_snapshots/i.test(sql) || /DELETE\s+FROM\s+quote_snapshots/i.test(sql)) {
      throw new Error("quote_snapshots are write-once");
    }
    if (sql.includes("FROM quotes") && sql.includes("FOR UPDATE")) {
      if (params[0] !== quote.id || params[1] !== quote.contractor_id) {
        return { rows: [] };
      }
      return { rows: [{ ...quote, rooms: quote.rooms }] };
    }
    if (sql === SELECT_SNAPSHOT_FOR_QUOTE_SQL) {
      return { rows: snapshot ? [{ ...snapshot }] : [] };
    }
    if (sql.includes("FROM quote_line_items")) {
      return { rows: lines.map((item) => ({ ...item })) };
    }
    if (sql === SELECT_CONTRACTOR_BRAND_SQL) {
      return { rows: [{ ...brand }] };
    }
    if (sql === INSERT_QUOTE_SNAPSHOT_SQL) {
      snapshot = {
        id: "snap-1",
        quote_id: params[0],
        payload: params[2],
        contractor_display_name: params[3],
        contractor_trade: params[4],
        created_at: NOW,
      };
      return { rows: [{ ...snapshot }] };
    }
    if (sql === INSERT_APPROVAL_TOKEN_SQL) {
      tokenHash = params[2] as string;
      return { rows: [{ expires_at: params[3] }] };
    }
    if (sql === MARK_QUOTE_SENT_SQL) {
      const sentAt = quote.sent_at ?? (params[2] as Date);
      quote = {
        ...quote,
        status: "sent",
        sent_at: sentAt,
        customer_phone: params[3] as string,
      };
      return { rows: [{ id: quote.id, status: "sent", sent_at: sentAt }] };
    }
    throw new Error(`unexpected sql: ${sql}`);
  };

  return {
    queryFn,
    calls,
    lines,
    snapshot: () => snapshot,
    tokenHash: () => tokenHash,
    quote: () => quote,
  };
}

function senderSpy(): { sender: SmsSender; messages: Array<{ toPhone: string; approvalUrl: string }> } {
  const messages: Array<{ toPhone: string; approvalUrl: string }> = [];
  return {
    messages,
    sender: {
      mode: "dry-run",
      async sendQuoteLink(message) {
        messages.push({ toPhone: message.toPhone, approvalUrl: message.approvalUrl });
        return { mode: "dry-run" };
      },
    },
  };
}

describe("sendQuoteForApproval", () => {
  it("writes one snapshot and token, returns the dry-run URL, and does not store the raw token", async () => {
    const db = createDb({
      quote: quoteRow(),
      lines: [
        lineRow(),
        lineRow({
          id: "44444444-4444-4444-8444-444444444444",
          name: "Keep the tub",
          unit_price_cents: 45000,
          option_role: "alt",
          option_group_id: "55555555-5555-4555-8555-555555555555",
        }),
        lineRow({
          id: "66666666-6666-4666-8666-666666666666",
          name: "Quartz countertop",
          unit_price_cents: 0,
          room_id: null,
          price_source: "unknown",
        }),
      ],
    });
    const rawToken = generateApprovalToken();
    const sms = senderSpy();
    const outcome = await sendQuoteForApproval(db.queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: {},
      sender: sms.sender,
      now: NOW,
      publicBaseUrl: "https://quotes.example/",
      ttlMs: 72 * 60 * 60 * 1000,
      generateToken: () => rawToken,
    });

    assert.equal(outcome.status, 201);
    if (outcome.status !== 201) return;
    assert.equal(outcome.json.approvalUrl, `https://quotes.example/q/${rawToken}`);
    assert.equal(outcome.json.sms.mode, "dry-run");
    assert.equal(outcome.json.status, "sent");
    assert.equal(outcome.json.sentAt, NOW.toISOString());
    assert.equal(outcome.json.expiresAt, "2026-10-07T12:00:00.000Z");
    assert.deepEqual(sms.messages, [
      { toPhone: "+15555550100", approvalUrl: outcome.json.approvalUrl },
    ]);
    assert.equal(db.tokenHash(), hashApprovalToken(rawToken));
    assert.notEqual(db.tokenHash(), rawToken);

    const payload = JSON.parse(String(db.snapshot()?.payload));
    assert.equal(payload.totalCents, 25000);
    assert.equal(payload.lineItems[0].name, "Faucet");
    assert.equal(payload.lineItems[0].unitPriceCents, 25000);
    assert.equal(payload.lineItems[0].roomName, "Kitchen");
    assert.equal(payload.lineItems[1].name, "Quartz countertop");
    assert.equal(payload.lineItems[1].unitPriceCents, null);
    const json = JSON.stringify(payload);
    assert.equal(json.includes("Keep the tub"), false);
    assert.equal(json.includes(SECRET_JOB), false);
    assert.equal(json.includes(SECRET_LINE), false);
    assert.equal(json.includes("locked gate"), false);
    assert.equal(db.snapshot()?.contractor_display_name, "Sam");
    assert.equal(db.snapshot()?.contractor_trade, "plumbing");

    const sqlText = db.calls.map((call) => call.sql).join("\n");
    assert.equal(sqlText.includes("fcm_token"), false);
    assert.equal(sqlText.includes("quote_attachments"), false);
    assert.equal(sqlText.includes(rawToken), false);
    for (const call of db.calls) {
      assert.equal(JSON.stringify(call.params).includes(rawToken), false);
      if (call.sql.startsWith("UPDATE quotes")) {
        assert.equal(call.sql.includes("total_cents"), false);
        assert.equal(call.sql.includes("quote_line_items"), false);
      }
    }
    assert.equal(db.calls.filter((call) => call.sql === INSERT_QUOTE_SNAPSHOT_SQL).length, 1);
  });

  it("refuses a second send without updating the snapshot or minting another token", async () => {
    const db = createDb({
      quote: quoteRow(),
      lines: [lineRow()],
    });
    const rawToken = generateApprovalToken();
    const sms = senderSpy();
    const args = {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: { customerPhone: "+15555550100" },
      sender: sms.sender,
      now: NOW,
      publicBaseUrl: "http://localhost:3000",
      ttlMs: 1000,
      generateToken: () => rawToken,
    };
    const first = await sendQuoteForApproval(db.queryFn, args);
    assert.equal(first.status, 201);
    const original = String(db.snapshot()?.payload);
    db.lines[0]!.unit_price_cents = 1;
    db.lines[0]!.name = "Changed after send";

    const second = await sendQuoteForApproval(db.queryFn, {
      ...args,
      generateToken: () => generateApprovalToken(),
    });
    assert.equal(second.status, 409);
    if (second.status === 409) {
      assert.equal(second.json.error, SNAPSHOT_EXISTS_ERROR);
    }
    assert.equal(String(db.snapshot()?.payload), original);
    assert.equal(JSON.parse(original).lineItems[0].name, "Faucet");
    assert.equal(JSON.parse(original).lineItems[0].unitPriceCents, 25000);
    assert.equal(sms.messages.length, 1);
    assert.equal(db.calls.filter((call) => call.sql === INSERT_QUOTE_SNAPSHOT_SQL).length, 1);
    assert.equal(db.calls.filter((call) => call.sql === INSERT_APPROVAL_TOKEN_SQL).length, 1);
    assert.equal(db.calls.some((call) => /UPDATE\s+quote_snapshots/i.test(call.sql)), false);
  });

  it("keeps an existing sent_at when the quote was already marked sent by share", async () => {
    const db = createDb({
      quote: quoteRow({ status: "sent", sent_at: ALREADY_SENT_AT, customer_phone: null }),
      lines: [lineRow()],
    });
    const sms = senderSpy();
    const outcome = await sendQuoteForApproval(db.queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: { customerPhone: "+15555550122" },
      sender: sms.sender,
      now: NOW,
      publicBaseUrl: "http://localhost:3000",
      ttlMs: 1000,
      generateToken: () => generateApprovalToken(),
    });
    assert.equal(outcome.status, 201);
    if (outcome.status !== 201) return;
    assert.equal(outcome.json.sentAt, ALREADY_SENT_AT.toISOString());
    assert.equal(db.quote().customer_phone, "+15555550122");
    assert.equal(sms.messages[0]!.toPhone, "+15555550122");
  });

  it("does not invent a phone or a snapshot when the quote cannot be sent", async () => {
    const noPhone = createDb({
      quote: quoteRow({ customer_phone: null }),
      lines: [lineRow()],
    });
    const missingPhone = await sendQuoteForApproval(noPhone.queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: {},
      sender: senderSpy().sender,
      now: NOW,
      publicBaseUrl: "http://localhost:3000",
      ttlMs: 1000,
      generateToken: () => generateApprovalToken(),
    });
    assert.equal(missingPhone.status, 400);
    if (missingPhone.status === 400) {
      assert.equal(missingPhone.json.error, SEND_PHONE_REQUIRED_ERROR);
    }
    assert.equal(noPhone.snapshot(), null);

    const empty = createDb({
      quote: quoteRow(),
      lines: [lineRow({ name: "Keep the tub", option_role: "alt", option_group_id: ROOM_ID })],
    });
    const noLines = await sendQuoteForApproval(empty.queryFn, {
      quoteId: QUOTE_ID,
      contractorId: CONTRACTOR_ID,
      body: {},
      sender: senderSpy().sender,
      now: NOW,
      publicBaseUrl: "http://localhost:3000",
      ttlMs: 1000,
      generateToken: () => generateApprovalToken(),
    });
    assert.equal(noLines.status, 400);
    if (noLines.status === 400) {
      assert.equal(noLines.json.error, SEND_EMPTY_QUOTE_ERROR);
    }
    assert.equal(empty.snapshot(), null);

    for (const status of ["approved", "declined", "expired", "failed_send", "ai_processing"] as const) {
      const db = createDb({ quote: quoteRow({ status }), lines: [lineRow()] });
      const outcome = await sendQuoteForApproval(db.queryFn, {
        quoteId: QUOTE_ID,
        contractorId: CONTRACTOR_ID,
        body: {},
        sender: senderSpy().sender,
        now: NOW,
        publicBaseUrl: "http://localhost:3000",
        ttlMs: 1000,
        generateToken: () => generateApprovalToken(),
      });
      assert.equal(outcome.status, 409, status);
      if (outcome.status === 409) {
        assert.equal(outcome.json.error, QUOTE_NOT_SENDABLE_ERROR);
      }
      assert.equal(db.snapshot(), null);
      assert.equal(db.calls.some((call) => call.sql === INSERT_QUOTE_SNAPSHOT_SQL), false);
    }

    const other = createDb({ quote: quoteRow(), lines: [lineRow()] });
    const missing = await sendQuoteForApproval(other.queryFn, {
      quoteId: QUOTE_ID,
      contractorId: OTHER_ID,
      body: {},
      sender: senderSpy().sender,
      now: NOW,
      publicBaseUrl: "http://localhost:3000",
      ttlMs: 1000,
      generateToken: () => generateApprovalToken(),
    });
    assert.equal(missing.status, 404);
  });

  it("includes the approval URL only for the dry-run sender", () => {
    const json = sendQuoteJson({
      quoteId: QUOTE_ID,
      sentAt: NOW,
      expiresAt: new Date("2026-10-07T12:00:00.000Z"),
      approvalUrl: "http://localhost:3000/q/token",
      smsMode: "dry-run",
    });
    assert.equal(json.approvalUrl, "http://localhost:3000/q/token");
    assert.equal(json.sms.mode, "dry-run");
  });

  it("is mounted as an authenticated route and the public page is mounted at /q", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const quotes = readFileSync(path.join(here, "../routes/quotes.ts"), "utf8");
    const index = readFileSync(path.join(here, "../index.ts"), "utf8");
    assert.match(quotes, /router\.post\("\/:id\/send", authenticateToken/);
    assert.match(quotes, /resolveSmsSender\(process\.env\["SMS_SENDER"\]\)/);
    assert.match(index, /app\.use\("\/q", approvalRouter\)/);
  });
});
