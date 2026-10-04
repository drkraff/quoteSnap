import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MARK_QUOTE_APPROVED_SQL,
  MARK_QUOTE_DECLINED_SQL,
  SELECT_APPROVAL_SQL,
  approvalHttpResult,
  classifyApprovalRow,
  decideApproval,
  renderExpiredPage,
  renderNotFoundPage,
} from "./approval-page.js";
import { generateApprovalToken, hashApprovalToken } from "./approval-token.js";
import type { SnapshotQueryFn } from "./quote-snapshot.js";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "subcontractor check — do not tell the client";
const PHONE = "+15555550999";
const NOW = new Date("2026-10-04T23:04:00.000Z");
const FUTURE = new Date("2026-10-07T23:04:00.000Z");
const PAST = new Date("2026-10-01T00:00:00.000Z");

function payload(overrides: Record<string, unknown> = {}) {
  return {
    customerPhone: PHONE,
    totalCents: 25000,
    clientSentence: "Do not include <script>alert(2)</script>",
    privateNote: SECRET,
    lineItems: [
      {
        name: `Faucet "><script>alert(1)</script>`,
        quantity: 1,
        unitPriceCents: 25000,
        unit: "each",
        roomName: "Kitchen <b>",
      },
      {
        name: "Quartz countertop",
        quantity: 12,
        unitPriceCents: null,
        unit: "foot",
        roomName: null,
      },
    ],
    ...overrides,
  };
}

type Stored = {
  tokenHash: string;
  expires_at: Date;
  quote_id: string;
  payload: unknown;
  contractor_display_name: string | null;
  contractor_trade: string | null;
  status: string;
  approved_at: Date | null;
  declined_at: Date | null;
  liveUnitPriceCents?: number;
};

function createApprovalDb(stored: Stored) {
  const calls: string[] = [];
  let row = { ...stored };
  const queryFn: SnapshotQueryFn = async (sql, params = []) => {
    calls.push(sql);
    if (/UPDATE\s+quote_snapshots/i.test(sql) || sql.includes("quote_line_items")) {
      throw new Error(`unexpected write: ${sql}`);
    }
    if (sql.includes("FROM quote_approval_tokens")) {
      if (params[0] !== row.tokenHash) {
        return { rows: [] };
      }
      return {
        rows: [{
          expires_at: row.expires_at,
          quote_id: row.quote_id,
          payload: row.payload,
          contractor_display_name: row.contractor_display_name,
          contractor_trade: row.contractor_trade,
          status: row.status,
          approved_at: row.approved_at,
          declined_at: row.declined_at,
          liveUnitPriceCents: 99999,
        }],
      };
    }
    if (sql === MARK_QUOTE_APPROVED_SQL) {
      if (row.status !== "sent") {
        return { rows: [] };
      }
      row = { ...row, status: "approved", approved_at: params[1] as Date };
      return { rows: [{ approved_at: row.approved_at }] };
    }
    if (sql === MARK_QUOTE_DECLINED_SQL) {
      if (row.status !== "sent") {
        return { rows: [] };
      }
      row = { ...row, status: "declined", declined_at: params[1] as Date };
      return { rows: [{ declined_at: row.declined_at }] };
    }
    throw new Error(`unexpected sql: ${sql}`);
  };
  return {
    queryFn,
    calls,
    row: () => row,
  };
}

describe("approval page rendering", () => {
  it("renders the snapshot, escapes output, and leaves blanks blank", async () => {
    const token = generateApprovalToken();
    const db = createApprovalDb({
      tokenHash: hashApprovalToken(token),
      expires_at: FUTURE,
      quote_id: QUOTE_ID,
      payload: payload({ totalCents: 180000 }),
      contractor_display_name: "Sam & Sons <b>",
      contractor_trade: "plumbing",
      status: "sent",
      approved_at: null,
      declined_at: null,
    });
    const result = await approvalHttpResult({
      token,
      queryFn: db.queryFn,
      now: NOW,
    });
    assert.equal(result.status, 200);
    assert.match(result.html, /Sam &amp; Sons &lt;b&gt;/);
    assert.match(result.html, /Plumbing/);
    assert.match(result.html, /Kitchen &lt;b&gt;/);
    assert.match(result.html, /Faucet &quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(result.html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
    assert.equal(result.html.toLowerCase().includes("<script"), false);
    assert.equal(result.html.includes(SECRET), false);
    assert.equal(result.html.includes(PHONE), false);
    assert.equal(result.html.includes("$999.99"), false);
    assert.equal(result.html.includes("$0.00"), false);
    assert.match(result.html, /\$250\.00/);
    assert.match(result.html, /\$1800\.00/);
    assert.match(result.html, /Quartz countertop/);
    assert.match(result.html, />Approve</);
    assert.match(result.html, />Decline</);
    assert.match(result.html, /name="viewport"/);
    assert.equal(SELECT_APPROVAL_SQL.includes("quote_line_items"), false);
    assert.equal(SELECT_APPROVAL_SQL.includes("contractors"), false);
    assert.match(SELECT_APPROVAL_SQL, /s\.payload/);
  });

  it("uses one not-found page for unknown and malformed tokens", async () => {
    let queries = 0;
    const queryFn: SnapshotQueryFn = async () => {
      queries += 1;
      return { rows: [] };
    };
    const unknown = await approvalHttpResult({
      token: generateApprovalToken(),
      queryFn,
      now: NOW,
    });
    const malformed = await approvalHttpResult({
      token: "<script>alert(1)</script>",
      queryFn,
      now: NOW,
    });
    const short = await approvalHttpResult({
      token: "abc",
      queryFn,
      now: NOW,
    });
    const huge = await approvalHttpResult({
      token: "a".repeat(300),
      queryFn,
      now: NOW,
    });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.html, malformed.html);
    assert.equal(unknown.html, short.html);
    assert.equal(unknown.html, huge.html);
    assert.equal(unknown.html, renderNotFoundPage());
    assert.equal(unknown.html.includes("<script"), false);
    assert.equal(unknown.html.includes("alert(1)"), false);
    assert.equal(unknown.html.includes("invalid"), false);
    assert.equal(unknown.html.includes("malformed"), false);
    assert.notEqual(unknown.html, renderExpiredPage());
    assert.equal(queries, 1);
  });

  it("shows a neutral expired page for a past token and does not approve it", async () => {
    const token = generateApprovalToken();
    const db = createApprovalDb({
      tokenHash: hashApprovalToken(token),
      expires_at: PAST,
      quote_id: QUOTE_ID,
      payload: payload(),
      contractor_display_name: "Sam",
      contractor_trade: "electrical",
      status: "sent",
      approved_at: null,
      declined_at: null,
    });
    const viewed = await approvalHttpResult({ token, queryFn: db.queryFn, now: NOW });
    assert.equal(viewed.status, 200);
    assert.equal(viewed.html, renderExpiredPage());
    assert.match(viewed.html, /This quote has expired/);
    assert.equal(/error/i.test(viewed.html), false);
    assert.equal(viewed.html.includes("Faucet"), false);
    assert.equal(viewed.html.includes("Internal server error"), false);

    const tapped = await approvalHttpResult({
      token,
      action: "approve",
      queryFn: db.queryFn,
      now: NOW,
    });
    assert.equal(tapped.html, renderExpiredPage());
    assert.equal(tapped.status, 200);
    assert.equal(db.calls.some((sql) => sql === MARK_QUOTE_APPROVED_SQL), false);
    assert.equal(db.row().status, "sent");
  });

  it("treats an already-expired status the same way, and keeps a recorded approval", () => {
    const token = generateApprovalToken();
    const base = {
      expires_at: PAST,
      quote_id: QUOTE_ID,
      payload: payload(),
      contractor_display_name: "Sam",
      contractor_trade: null,
      approved_at: NOW,
      declined_at: null,
    };
    const expired = classifyApprovalRow(
      { ...base, status: "expired", approved_at: null },
      NOW,
      token,
    );
    assert.equal(expired.kind, "expired");
    const stillApproved = classifyApprovalRow(
      { ...base, status: "approved" },
      NOW,
      token,
    );
    assert.equal(stillApproved.kind, "approved");
  });
});

describe("decideApproval", () => {
  it("records the first approval timestamp and ignores a later decline or second tap", async () => {
    const token = generateApprovalToken();
    const db = createApprovalDb({
      tokenHash: hashApprovalToken(token),
      expires_at: FUTURE,
      quote_id: QUOTE_ID,
      payload: payload({ clientSentence: null, lineItems: payload().lineItems }),
      contractor_display_name: "Sam",
      contractor_trade: "hvac",
      status: "sent",
      approved_at: null,
      declined_at: null,
    });

    const approved = await decideApproval(db.queryFn, token, "approve", NOW);
    assert.equal(approved.kind, "approved");
    if (approved.kind !== "approved") return;
    assert.equal(approved.decidedAt, "4 Oct 2026, 23:04 UTC");
    assert.equal(db.row().status, "approved");
    assert.equal(db.row().approved_at?.toISOString(), NOW.toISOString());
    const approvedHtml = (await approvalHttpResult({
      token,
      action: "decline",
      queryFn: db.queryFn,
      now: new Date("2026-10-05T01:00:00.000Z"),
    })).html;
    assert.match(approvedHtml, /You approved this quote\./);
    assert.match(approvedHtml, /4 Oct 2026, 23:04 UTC/);
    assert.equal(approvedHtml.includes("You declined this quote"), false);
    assert.equal(approvedHtml.includes(">Approve<"), false);
    assert.equal(approvedHtml.includes(">Decline<"), false);
    assert.equal(db.row().status, "approved");
    assert.equal(db.row().approved_at?.toISOString(), NOW.toISOString());
    assert.equal(db.calls.filter((sql) => sql === MARK_QUOTE_APPROVED_SQL).length, 1);
    assert.equal(db.calls.filter((sql) => sql === MARK_QUOTE_DECLINED_SQL).length, 0);
    assert.match(approvedHtml, /HVAC/);
    assert.match(approvedHtml, /\$250\.00/);
  });

  it("does not flip a decline into an approval", async () => {
    const token = generateApprovalToken();
    const db = createApprovalDb({
      tokenHash: hashApprovalToken(token),
      expires_at: FUTURE,
      quote_id: QUOTE_ID,
      payload: payload(),
      contractor_display_name: "Sam",
      contractor_trade: "electrical",
      status: "sent",
      approved_at: null,
      declined_at: null,
    });
    const declined = await decideApproval(db.queryFn, token, "decline", NOW);
    assert.equal(declined.kind, "declined");
    const again = await decideApproval(
      db.queryFn,
      token,
      "approve",
      new Date("2026-10-05T01:00:00.000Z"),
    );
    assert.equal(again.kind, "declined");
    if (again.kind !== "declined") return;
    assert.equal(again.decidedAt, "4 Oct 2026, 23:04 UTC");
    assert.equal(db.row().status, "declined");
    assert.equal(db.calls.filter((sql) => sql === MARK_QUOTE_APPROVED_SQL).length, 0);
    assert.equal(db.calls.filter((sql) => sql === MARK_QUOTE_DECLINED_SQL).length, 1);
    const html = (await approvalHttpResult({
      token,
      action: "approve",
      queryFn: db.queryFn,
      now: NOW,
    })).html;
    assert.match(html, /You declined this quote\./);
    assert.equal(html.includes("You approved this quote"), false);
  });
});
