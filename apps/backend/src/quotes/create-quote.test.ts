import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { randomUUID } from "node:crypto";
import { createQuote } from "./create-quote.js";
import { createQuotesRouter, type QuotesRouteQuery } from "../routes/quotes-router.js";
import type { QuoteRow } from "../routes/quotes-payload.js";

const CONTRACTOR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTRACTOR_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT_KEY = "local-quote-1";

type StoredQuote = QuoteRow & { client_key: string | null };

function createQuoteMemory() {
  const rows: StoredQuote[] = [];
  const calls: { sql: string; params?: unknown[] }[] = [];

  const query: QuotesRouteQuery = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("UPDATE")) {
      throw new Error("create retry must not update the existing quote");
    }
    if (sql.includes("INSERT INTO quotes")) {
      const contractorId = params?.[0] as string;
      const clientKey = (params?.[6] ?? null) as string | null;
      if (clientKey != null) {
        const clash = rows.find(
          (row) => row.contractor_id === contractorId && row.client_key === clientKey,
        );
        if (clash) {
          if (sql.includes("DO NOTHING")) {
            return { rows: [] };
          }
          const err = new Error("duplicate key") as Error & { code: string };
          err.code = "23505";
          throw err;
        }
      }
      const now = new Date("2026-10-05T00:00:00.000Z");
      const row: StoredQuote = {
        id: randomUUID(),
        contractor_id: contractorId,
        status: params?.[1] as string,
        customer_phone: (params?.[2] as string | null) ?? null,
        total_cents: params?.[3] as number,
        created_at: now,
        updated_at: now,
        sent_at: null,
        voice_job_id: null,
        is_archived: false,
        private_note: (params?.[4] as string | null) ?? null,
        client_sentence: (params?.[5] as string | null) ?? null,
        rooms: null,
        ai_failure_stage: null,
        client_key: clientKey,
      };
      rows.push(row);
      return { rows: [row] };
    }
    if (sql.includes("client_key")) {
      return {
        rows: rows.filter(
          (row) => row.contractor_id === params?.[0] && row.client_key === params?.[1],
        ),
      };
    }
    return { rows: [] };
  };

  return { query, rows, calls };
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

async function postQuote(
  url: string,
  contractorId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; quote: { id: string; totalCents: number } }> {
  const response = await fetch(`${url}/quotes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-contractor-id": contractorId,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json() as { quote?: { id: string; totalCents: number } };
  assert.ok(json.quote, `expected a quote body, got ${JSON.stringify(json)}`);
  return { status: response.status, quote: json.quote };
}

describe("POST /quotes client key", () => {
  it("returns the existing quote when the create response was lost", async () => {
    const db = createQuoteMemory();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const contractorId = req.header("x-contractor-id");
      if (contractorId) {
        req.contractor = { contractorId, email: null, phone: null };
      }
      next();
    });
    app.use("/quotes", createQuotesRouter({
      query: db.query,
      withTransaction: async (fn) => fn(db.query),
      authenticate: (_req, _res, next) => next(),
    }));
    const server = await listen(app);
    try {
      const first = await postQuote(server.url, CONTRACTOR_A, {
        status: "draft_local",
        totalCents: 0,
        clientKey: CLIENT_KEY,
      });
      assert.equal(first.status, 201);
      const second = await postQuote(server.url, CONTRACTOR_A, {
        status: "draft_local",
        totalCents: 9999,
        clientKey: CLIENT_KEY,
      });
      assert.equal(second.status, 200);
      assert.equal(second.quote.id, first.quote.id);
      assert.equal(second.quote.totalCents, 0);
      assert.equal(db.rows.length, 1);
      assert.equal(db.rows[0]?.total_cents, 0);
      assert.equal(db.calls.some((call) => call.sql.includes("UPDATE")), false);
    } finally {
      await server.close();
    }
  });

  it("does not collide when two contractors reuse the same client key", async () => {
    const db = createQuoteMemory();
    const app = express();
    app.use(express.json());
    app.use("/quotes", createQuotesRouter({
      query: db.query,
      withTransaction: async (fn) => fn(db.query),
      authenticate: (req, _res, next) => {
        const contractorId = req.header("x-contractor-id") ?? CONTRACTOR_A;
        req.contractor = { contractorId, email: null, phone: null };
        next();
      },
    }));
    const server = await listen(app);
    try {
      const a = await postQuote(server.url, CONTRACTOR_A, { clientKey: CLIENT_KEY, totalCents: 100 });
      const b = await postQuote(server.url, CONTRACTOR_B, { clientKey: CLIENT_KEY, totalCents: 200 });
      assert.equal(a.status, 201);
      assert.equal(b.status, 201);
      assert.notEqual(a.quote.id, b.quote.id);
      assert.equal(a.quote.totalCents, 100);
      assert.equal(b.quote.totalCents, 200);
      assert.equal(db.rows.length, 2);
    } finally {
      await server.close();
    }
  });

  it("inserts a new quote for each request that omits the client key", async () => {
    const db = createQuoteMemory();
    const first = await createQuote(db.query, {
      contractorId: CONTRACTOR_A,
      body: { totalCents: 0 },
    });
    const second = await createQuote(db.query, {
      contractorId: CONTRACTOR_A,
      body: { totalCents: 0, clientKey: "   " },
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    if (first.status === 201 && second.status === 201) {
      assert.notEqual(first.json.quote.id, second.json.quote.id);
    }
    assert.equal(db.rows.length, 2);
    assert.equal(db.rows.every((row) => row.client_key == null), true);
  });

  it("recovers the existing row when the insert raises a unique violation", async () => {
    const existing: StoredQuote = {
      id: "11111111-1111-4111-8111-111111111111",
      contractor_id: CONTRACTOR_A,
      status: "draft_local",
      customer_phone: null,
      total_cents: 40,
      created_at: new Date("2026-10-05T00:00:00.000Z"),
      updated_at: new Date("2026-10-05T00:00:00.000Z"),
      sent_at: null,
      voice_job_id: null,
      is_archived: false,
      private_note: null,
      client_sentence: null,
      rooms: null,
      ai_failure_stage: null,
      client_key: CLIENT_KEY,
    };
    let inserts = 0;
    const query: QuotesRouteQuery = async (sql, params) => {
      if (sql.includes("INSERT INTO quotes")) {
        inserts += 1;
        const err = new Error("duplicate key") as Error & { code: string };
        err.code = "23505";
        throw err;
      }
      if (sql.includes("client_key")) {
        assert.equal(params?.[0], CONTRACTOR_A);
        assert.equal(params?.[1], CLIENT_KEY);
        return { rows: [existing] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    };
    const outcome = await createQuote(query, {
      contractorId: CONTRACTOR_A,
      body: { clientKey: CLIENT_KEY, totalCents: 9999 },
    });
    assert.equal(inserts, 1);
    assert.equal(outcome.status, 200);
    if (outcome.status === 200) {
      assert.equal(outcome.json.quote.id, existing.id);
      assert.equal(outcome.json.quote.totalCents, 40);
    }
  });

  it("rejects a non-string or oversized client key before insert", async () => {
    const db = createQuoteMemory();
    const numeric = await createQuote(db.query, {
      contractorId: CONTRACTOR_A,
      body: { clientKey: 12 },
    });
    const huge = await createQuote(db.query, {
      contractorId: CONTRACTOR_A,
      body: { clientKey: "k".repeat(65) },
    });
    assert.equal(numeric.status, 400);
    assert.equal(huge.status, 400);
    assert.equal(db.rows.length, 0);
    assert.equal(db.calls.length, 0);
  });
});
