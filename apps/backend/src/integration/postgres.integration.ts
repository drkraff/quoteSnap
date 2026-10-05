/**
 * Live Postgres proofs. `npm test` only loads `*.test.ts`, so this file stays out of that run.
 * Requires DATABASE_URL. Applies migrations itself so a migrated database is enough.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import jwt from "jsonwebtoken";
import { query, withTransaction } from "../db/connection.js";
import pool from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";
import { createQuote } from "../quotes/create-quote.js";
import {
  INSERT_REFRESH_TOKEN_SQL,
  INVALID_REFRESH_TOKEN_ERROR,
  generateRefreshToken,
  hashRefreshToken,
  rotateRefreshToken,
} from "../auth/refresh.js";
import { generateApprovalToken, hashApprovalToken } from "../quotes/approval-token.js";
import {
  MARK_QUOTE_APPROVED_SQL,
  MARK_QUOTE_DECLINED_SQL,
  approvalHttpResult,
} from "../quotes/approval-page.js";
import type { SnapshotQueryFn } from "../quotes/quote-snapshot.js";
import { router as approvalRouter } from "../routes/approval.js";
import { createQuotesRouter } from "../routes/quotes-router.js";
import { createVoiceDraftHandler } from "../routes/voice-draft.js";
import { authenticateToken } from "../middleware/auth.js";
import { errorHandler, requestIdMiddleware } from "../log/http.js";
import {
  INSERT_RATE_CARD_SQL,
  SELECT_RATE_CARD_BY_KEY_SQL,
  upsertRateCardEntry,
  type RateCardQueryFn,
} from "../rate-card/upsert.js";

if (!process.env["JWT_ACCESS_SECRET"] || process.env["JWT_ACCESS_SECRET"].length < 32) {
  process.env["JWT_ACCESS_SECRET"] = "integration-test-jwt-secret-32-chars-min";
}

const SNAPSHOT_PAYLOAD = {
  customerPhone: "5551234567",
  totalCents: 25000,
  clientSentence: null,
  lineItems: [
    { name: "Faucet", quantity: 1, unitPriceCents: 25000, unit: "each", roomName: null },
  ],
};

type QuoteJson = { quote: { id: string; totalCents: number } };

function bearer(contractorId: string): string {
  const token = jwt.sign(
    { contractorId, email: null, phone: null },
    process.env["JWT_ACCESS_SECRET"]!,
    { algorithm: "HS256", expiresIn: "15m" },
  );
  return `Bearer ${token}`;
}

async function insertContractor(): Promise<string> {
  const result = await query(
    `INSERT INTO contractors (email, password_hash, display_name, trade)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [`it-${randomUUID()}@integration.test`, "integration-hash", "Sam", "plumbing"],
  );
  return (result.rows[0] as { id: string }).id;
}

async function insertSnapshot(contractorId: string): Promise<{ quoteId: string; snapshotId: string }> {
  const quote = await query(
    `INSERT INTO quotes (contractor_id, status, total_cents, customer_phone, sent_at)
     VALUES ($1, 'sent', 25000, '5551234567', NOW())
     RETURNING id`,
    [contractorId],
  );
  const quoteId = (quote.rows[0] as { id: string }).id;
  const snapshot = await query(
    `INSERT INTO quote_snapshots (quote_id, contractor_id, payload, contractor_display_name, contractor_trade)
     VALUES ($1, $2, $3::jsonb, 'Sam', 'plumbing')
     RETURNING id`,
    [quoteId, contractorId, JSON.stringify(SNAPSHOT_PAYLOAD)],
  );
  return { quoteId, snapshotId: (snapshot.rows[0] as { id: string }).id };
}

async function snapshotText(snapshotId: string): Promise<string> {
  const result = await query(
    `SELECT payload::text AS payload, contractor_display_name, contractor_trade
     FROM quote_snapshots WHERE id = $1`,
    [snapshotId],
  );
  assert.equal(result.rows.length, 1);
  const row = result.rows[0] as {
    payload: string;
    contractor_display_name: string | null;
    contractor_trade: string | null;
  };
  return `${row.payload}|${row.contractor_display_name}|${row.contractor_trade}`;
}

async function expectWriteOnce(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assert.match(message, /quote_snapshots are write-once/);
    return;
  }
  assert.fail("expected quote_snapshots write-once rejection");
}

async function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

function quotesApp(): express.Express {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use("/quotes", createQuotesRouter({ query, withTransaction }));
  app.get("/voice/draft/:quoteId", authenticateToken, createVoiceDraftHandler(query));
  app.use(errorHandler);
  return app;
}

async function postQuote(
  url: string,
  contractorId: string,
  body: { clientKey: string; totalCents: number },
): Promise<{ status: number; json: QuoteJson }> {
  const response = await fetch(`${url}/quotes`, {
    method: "POST",
    headers: {
      authorization: bearer(contractorId),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await response.json() as QuoteJson;
  return { status: response.status, json };
}

async function insertOpenApproval(contractorId: string): Promise<{
  quoteId: string;
  snapshotId: string;
  token: string;
}> {
  const { quoteId, snapshotId } = await insertSnapshot(contractorId);
  const token = generateApprovalToken();
  await query(
    `INSERT INTO quote_approval_tokens (quote_id, snapshot_id, token_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '3 days')`,
    [quoteId, snapshotId, hashApprovalToken(token)],
  );
  return { quoteId, snapshotId, token };
}

function decisionPhrase(html: string): "approved" | "declined" | "other" {
  const approved = html.includes("You approved this quote");
  const declined = html.includes("You declined this quote");
  if (approved && !declined) return "approved";
  if (declined && !approved) return "declined";
  return "other";
}

describe("postgres integration", { concurrency: false }, () => {
  before(async () => {
    await runMigrations();
  });

  after(async () => {
    await pool.end();
  });

  it("stores one quote when two creates share a client key", async () => {
    const contractorId = await insertContractor();
    const clientKey = randomUUID();
    const app = quotesApp();
    const server = await listen(app);
    try {
      const first = await postQuote(server.url, contractorId, { clientKey, totalCents: 4200 });
      const second = await postQuote(server.url, contractorId, { clientKey, totalCents: 9999 });
      assert.equal(first.status, 201);
      assert.equal(second.status, 200);
      assert.equal(second.json.quote.id, first.json.quote.id);
      assert.equal(first.json.quote.totalCents, 4200);
      assert.equal(second.json.quote.totalCents, 4200);

      const stored = await query(
        `SELECT id, total_cents FROM quotes WHERE contractor_id = $1 AND client_key = $2`,
        [contractorId, clientKey],
      );
      assert.equal(stored.rows.length, 1);
      assert.equal((stored.rows[0] as { id: string }).id, first.json.quote.id);
      assert.equal((stored.rows[0] as { total_cents: number }).total_cents, 4200);

      const racedKey = randomUUID();
      const [left, right] = await Promise.all([
        postQuote(server.url, contractorId, { clientKey: racedKey, totalCents: 1100 }),
        postQuote(server.url, contractorId, { clientKey: racedKey, totalCents: 2200 }),
      ]);
      assert.equal(left.status === 500 || right.status === 500, false);
      assert.equal(left.json.quote.id, right.json.quote.id);
      const raced = await query(
        `SELECT id, total_cents FROM quotes WHERE contractor_id = $1 AND client_key = $2`,
        [contractorId, racedKey],
      );
      assert.equal(raced.rows.length, 1);
      const racedCents = (raced.rows[0] as { total_cents: number }).total_cents;
      assert.ok(racedCents === 1100 || racedCents === 2200);
      assert.equal(left.json.quote.totalCents, racedCents);
      assert.equal(right.json.quote.totalCents, racedCents);

      const again = await createQuote(query, {
        contractorId,
        body: { clientKey, totalCents: 1 },
      });
      assert.equal(again.status, 200);
      if (again.status === 200) {
        assert.equal(again.json.quote.id, first.json.quote.id);
        assert.equal(again.json.quote.totalCents, 4200);
      }
    } finally {
      await server.close();
    }
  });

  it("rejects quote snapshot UPDATE and DELETE", async () => {
    const contractorId = await insertContractor();
    const { snapshotId } = await insertSnapshot(contractorId);
    const before = await snapshotText(snapshotId);

    await expectWriteOnce(() => query(
      `UPDATE quote_snapshots SET contractor_trade = 'hvac', payload = '{"totalCents":1,"lineItems":[]}'::jsonb WHERE id = $1`,
      [snapshotId],
    ));
    assert.equal(await snapshotText(snapshotId), before);

    await expectWriteOnce(() => query(
      `DELETE FROM quote_snapshots WHERE id = $1`,
      [snapshotId],
    ));
    assert.equal(await snapshotText(snapshotId), before);
  });

  it("still removes a snapshot when the quote or contractor row is deleted", async () => {
    const contractorId = await insertContractor();
    const quoteRow = await insertSnapshot(contractorId);
    await query(
      `INSERT INTO quote_approval_tokens (quote_id, snapshot_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
      [quoteRow.quoteId, quoteRow.snapshotId, randomBytes(32).toString("hex")],
    );
    await query(`DELETE FROM quotes WHERE id = $1`, [quoteRow.quoteId]);
    const quoteGone = await query(
      `SELECT id FROM quote_snapshots WHERE id = $1`,
      [quoteRow.snapshotId],
    );
    assert.equal(quoteGone.rows.length, 0);

    const other = await insertContractor();
    const cascaded = await insertSnapshot(other);
    await query(`DELETE FROM contractors WHERE id = $1`, [other]);
    const contractorGone = await query(
      `SELECT id FROM quote_snapshots WHERE id = $1`,
      [cascaded.snapshotId],
    );
    assert.equal(contractorGone.rows.length, 0);
  });

  it("lets one concurrent approval decision win and leaves the snapshot", async () => {
    const contractorId = await insertContractor();
    const open = await insertOpenApproval(contractorId);
    const before = await snapshotText(open.snapshotId);
    let releaseHold = (): void => {};
    const hold = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    let held = false;
    let markReached: () => void = () => {};
    const reachedUpdate = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("approve did not reach the status update")), 2000);
      markReached = () => {
        clearTimeout(timer);
        resolve();
      };
    });

    const wrap = (tx: SnapshotQueryFn): SnapshotQueryFn => async (sql, params) => {
      if (!held && (sql === MARK_QUOTE_APPROVED_SQL || sql === MARK_QUOTE_DECLINED_SQL)) {
        held = true;
        markReached();
        await hold;
      }
      return tx(sql, params);
    };

    const pending: Promise<unknown>[] = [];
    try {
      const approve = withTransaction((tx) => approvalHttpResult({
        token: open.token,
        action: "approve",
        queryFn: wrap(tx),
        now: new Date(),
      }));
      pending.push(approve);
      await reachedUpdate;

      const decline = withTransaction((tx) => approvalHttpResult({
        token: open.token,
        action: "decline",
        queryFn: tx,
        now: new Date(),
      }));
      pending.push(decline);

      const deadline = Date.now() + 2000;
      let blocked = false;
      while (Date.now() < deadline) {
        const locks = await query(
          `SELECT COUNT(*)::int AS n
           FROM pg_stat_activity
           WHERE datname = current_database()
             AND pid <> pg_backend_pid()
             AND wait_event_type = 'Lock'`,
        );
        if (Number((locks.rows[0] as { n: number }).n) >= 1) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(blocked, true, "decline did not wait on the approve row lock");

      releaseHold();
      const [approved, declined] = await Promise.all([approve, decline]);
      assert.equal(approved.status, 200);
      assert.equal(declined.status, 200);
      assert.equal(decisionPhrase(approved.html), "approved");
      assert.equal(decisionPhrase(declined.html), "approved");
      assert.equal(declined.html.includes("Something went wrong."), false);

      const quote = await query(
        `SELECT status, approved_at, declined_at FROM quotes WHERE id = $1`,
        [open.quoteId],
      );
      const row = quote.rows[0] as {
        status: string;
        approved_at: Date | null;
        declined_at: Date | null;
      };
      assert.equal(row.status, "approved");
      assert.ok(row.approved_at);
      assert.equal(row.declined_at, null);
      assert.equal(await snapshotText(open.snapshotId), before);
    } finally {
      releaseHold();
      await Promise.allSettled(pending);
    }
  });

  it("returns the winning decision from the approval router", async () => {
    const contractorId = await insertContractor();
    const open = await insertOpenApproval(contractorId);
    const before = await snapshotText(open.snapshotId);
    const app = express();
    app.use("/q", approvalRouter);
    const server = await listen(app);
    try {
      const [approveRes, declineRes] = await Promise.all([
        fetch(`${server.url}/q/${open.token}/approve`, { method: "POST" }),
        fetch(`${server.url}/q/${open.token}/decline`, { method: "POST" }),
      ]);
      const approveHtml = await approveRes.text();
      const declineHtml = await declineRes.text();
      assert.equal(approveRes.status, 200);
      assert.equal(declineRes.status, 200);
      const approvePhrase = decisionPhrase(approveHtml);
      const declinePhrase = decisionPhrase(declineHtml);
      assert.notEqual(approvePhrase, "other");
      assert.equal(declinePhrase, approvePhrase);

      const quote = await query(
        `SELECT status, approved_at, declined_at FROM quotes WHERE id = $1`,
        [open.quoteId],
      );
      const row = quote.rows[0] as {
        status: string;
        approved_at: Date | null;
        declined_at: Date | null;
      };
      assert.equal(row.status, approvePhrase);
      if (approvePhrase === "approved") {
        assert.ok(row.approved_at);
        assert.equal(row.declined_at, null);
      } else {
        assert.equal(row.approved_at, null);
        assert.ok(row.declined_at);
      }
      assert.equal(await snapshotText(open.snapshotId), before);
      const snapshots = await query(
        `SELECT COUNT(*)::int AS n FROM quote_snapshots WHERE quote_id = $1`,
        [open.quoteId],
      );
      assert.equal((snapshots.rows[0] as { n: number }).n, 1);
    } finally {
      await server.close();
    }
  });

  it("revokes the contractor's other live refresh rows when a revoked token is reused", async () => {
    const contractorId = await insertContractor();
    const rawA = generateRefreshToken();
    const rawB = generateRefreshToken();
    await query(INSERT_REFRESH_TOKEN_SQL, [contractorId, hashRefreshToken(rawA)]);
    await query(INSERT_REFRESH_TOKEN_SQL, [contractorId, hashRefreshToken(rawB)]);

    const rotated = await withTransaction((tx) => rotateRefreshToken(tx, {
      refreshToken: rawA,
      signAccessToken: () => "access",
    }));
    assert.equal(rotated.status, 200);

    const inside = await withTransaction((tx) => rotateRefreshToken(tx, {
      refreshToken: rawA,
      signAccessToken: () => "access",
    }));
    assert.equal(inside.status, 401);
    if (inside.status === 401) {
      assert.equal(inside.json.error, INVALID_REFRESH_TOKEN_ERROR);
    }
    const duringGrace = await query(
      `SELECT COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE revoked_at IS NULL)::int AS live
       FROM refresh_tokens WHERE contractor_id = $1`,
      [contractorId],
    );
    assert.equal((duringGrace.rows[0] as { n: number }).n, 3);
    assert.equal((duringGrace.rows[0] as { live: number }).live, 2);

    await query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW() - INTERVAL '2 minutes'
       WHERE token_hash = $1`,
      [hashRefreshToken(rawA)],
    );
    const reused = await withTransaction((tx) => rotateRefreshToken(tx, {
      refreshToken: rawA,
      signAccessToken: () => "access",
    }));
    assert.equal(reused.status, 401);
    if (reused.status === 401) {
      assert.equal(reused.json.error, INVALID_REFRESH_TOKEN_ERROR);
    }
    const after = await query(
      `SELECT COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE revoked_at IS NULL)::int AS live
       FROM refresh_tokens WHERE contractor_id = $1`,
      [contractorId],
    );
    assert.equal((after.rows[0] as { n: number }).n, 3);
    assert.equal((after.rows[0] as { live: number }).live, 0);
  });

  it("returns 404 for a non-UUID id", async () => {
    const contractorId = await insertContractor();
    const app = quotesApp();
    const server = await listen(app);
    const bad = "not-a-uuid";
    const photoId = "22222222-2222-4222-8222-222222222222";
    const headers = {
      authorization: bearer(contractorId),
      "content-type": "application/json",
    };
    try {
      const cases: { method: string; path: string; body?: unknown; error: string }[] = [
        { method: "GET", path: `/quotes/${bad}`, error: "Quote not found" },
        { method: "PUT", path: `/quotes/${bad}`, body: { totalCents: -1 }, error: "Quote not found" },
        { method: "POST", path: `/quotes/${bad}/send`, body: {}, error: "Quote not found" },
        { method: "POST", path: `/quotes/${bad}/photos`, body: {}, error: "Quote not found" },
        { method: "PATCH", path: `/quotes/${bad}/archive`, body: { archived: true }, error: "Quote not found" },
        { method: "GET", path: `/quotes/${bad}/photos/${photoId}`, error: "Photo not found" },
        { method: "GET", path: `/voice/draft/${bad}`, error: "Draft not found" },
      ];
      for (const item of cases) {
        const response = await fetch(`${server.url}${item.path}`, {
          method: item.method,
          headers,
          body: item.body === undefined ? undefined : JSON.stringify(item.body),
        });
        assert.equal(response.status, 404, item.path);
        assert.notEqual(response.status, 500, item.path);
        assert.deepEqual(await response.json(), { error: item.error }, item.path);
      }

      const missing = await fetch(`${server.url}/quotes/${randomUUID()}`, { headers });
      assert.equal(missing.status, 404);
      assert.deepEqual(await missing.json(), { error: "Quote not found" });
    } finally {
      await server.close();
    }
  });

  it("updates the existing rate card row when a concurrent insert hits 23505", async () => {
    const contractorId = await insertContractor();
    const name = `Valve ${randomUUID()}`;
    let emptySelects = 0;
    let openGate = (): void => {};
    const gate = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("rate card race did not reach two empty reads")),
        2000,
      );
      openGate = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    let uniqueViolations = 0;

    const queryFn: RateCardQueryFn = async (sql, params) => {
      if (sql === SELECT_RATE_CARD_BY_KEY_SQL) {
        const result = await query(sql, params);
        if (result.rows.length === 0) {
          emptySelects += 1;
          if (emptySelects === 2) openGate();
          await gate;
        }
        return result;
      }
      try {
        return await query(sql, params);
      } catch (err) {
        if (
          typeof err === "object"
          && err !== null
          && (err as { code?: unknown }).code === "23505"
          && sql === INSERT_RATE_CARD_SQL
        ) {
          uniqueViolations += 1;
        }
        throw err;
      }
    };

    const body = (unitPriceCents: number) => ({
      name,
      unit: "each",
      unitPriceCents,
      trade: "plumbing",
      source: "typed",
    });
    const [left, right] = await Promise.all([
      upsertRateCardEntry(queryFn, { contractorId, body: body(4500), recordedAtIso: "2026-10-05T00:00:00.000Z" }),
      upsertRateCardEntry(queryFn, { contractorId, body: body(8800), recordedAtIso: "2026-10-05T00:00:01.000Z" }),
    ]);

    assert.equal(uniqueViolations, 1);
    assert.equal(left.status, 200);
    assert.equal(right.status, 200);
    if (left.status !== 200 || right.status !== 200) return;

    const stored = await query(
      `SELECT id, unit_price_cents, use_count
       FROM rate_card_entries
       WHERE contractor_id = $1 AND normalized_name = $2`,
      [contractorId, name.trim().toLowerCase()],
    );
    assert.equal(stored.rows.length, 1);
    const row = stored.rows[0] as { id: string; unit_price_cents: number; use_count: number };
    assert.equal(row.use_count, 2);
    const updated = [left, right].find((outcome) => outcome.json.entry.useCount === 2);
    assert.ok(updated);
    assert.equal(updated.status, 200);
    if (updated.status === 200) {
      assert.equal(row.id, updated.json.entry.id);
      assert.equal(row.unit_price_cents, updated.json.entry.unitPriceCents);
    }
    assert.ok(row.unit_price_cents === 4500 || row.unit_price_cents === 8800);
  });
});
