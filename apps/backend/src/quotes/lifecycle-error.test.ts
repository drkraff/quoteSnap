import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import {
  QUOTE_STATUS_LOCKED_ERROR,
  quoteLifecycleConflict,
} from "./lifecycle-error.js";
import { QUOTE_MONEY_FROZEN_ERROR } from "./statuses.js";
import {
  DELETE_LINE_ITEMS_SQL,
  SELECT_QUOTE_FOR_UPDATE_SQL,
} from "./quote-write.js";
import { createQuotesRouter, type QuotesRouteQuery } from "../routes/quotes-router.js";
import type { QuoteRow } from "../routes/quotes-payload.js";

const QUOTE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function draftRow(): QuoteRow {
  const now = new Date("2026-10-05T00:00:00.000Z");
  return {
    id: QUOTE_ID,
    contractor_id: CONTRACTOR_ID,
    status: "draft_local",
    customer_phone: null,
    total_cents: 0,
    created_at: now,
    updated_at: now,
    sent_at: null,
    voice_job_id: null,
    is_archived: false,
    private_note: null,
    client_sentence: null,
    customer_name: null,
    exclusions: null,
    rooms: null,
    ai_failure_stage: null,
  };
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

function appWith(query: QuotesRouteQuery): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/quotes", createQuotesRouter({
    query,
    withTransaction: async (fn) => fn(query),
    authenticate: (req, _res, next) => {
      req.contractor = { contractorId: CONTRACTOR_ID, email: null, phone: null };
      next();
    },
  }));
  return app;
}

describe("quoteLifecycleConflict", () => {
  it("maps the sent-lock trigger text and ignores other check failures", () => {
    assert.equal(
      quoteLifecycleConflict(new Error("frozen quote cannot return to draft or voice")),
      QUOTE_STATUS_LOCKED_ERROR,
    );
    assert.equal(
      quoteLifecycleConflict(Object.assign(new Error("quote line items are write-once after send"), { code: "23514" })),
      QUOTE_MONEY_FROZEN_ERROR,
    );
    assert.equal(
      quoteLifecycleConflict(Object.assign(new Error('new row for relation "quotes" violates check constraint "quotes_status_allowed"'), { code: "23514" })),
      null,
    );
    assert.equal(quoteLifecycleConflict(new Error("connection refused")), null);
  });
});

describe("PUT /quotes maps a lifecycle rejection to 409", () => {
  it("returns 409 when replacing lines hits the write-once trigger", async () => {
    const query: QuotesRouteQuery = async (sql) => {
      if (sql === SELECT_QUOTE_FOR_UPDATE_SQL) return { rows: [draftRow()] };
      if (sql.includes("FROM quote_line_items") && sql.includes("SELECT")) return { rows: [] };
      if (sql === DELETE_LINE_ITEMS_SQL) {
        throw Object.assign(new Error("quote line items are write-once after send"), { code: "23514" });
      }
      return { rows: [] };
    };
    const server = await listen(appWith(query));
    try {
      const response = await fetch(`${server.url}/quotes/${QUOTE_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lineItems: [{ name: "Faucet", quantity: 1, unitPriceCents: 2500 }],
        }),
      });
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: QUOTE_MONEY_FROZEN_ERROR });
    } finally {
      await server.close();
    }
  });

  it("returns 409 when a status write hits the thaw trigger", async () => {
    const query: QuotesRouteQuery = async (sql) => {
      if (sql === SELECT_QUOTE_FOR_UPDATE_SQL) return { rows: [draftRow()] };
      if (sql.startsWith("UPDATE quotes")) {
        throw new Error("frozen quote cannot return to draft or voice");
      }
      return { rows: [] };
    };
    const server = await listen(appWith(query));
    try {
      const response = await fetch(`${server.url}/quotes/${QUOTE_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "draft_local" }),
      });
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: QUOTE_STATUS_LOCKED_ERROR });
    } finally {
      await server.close();
    }
  });

  it("keeps an unexpected write failure as 500", async () => {
    const query: QuotesRouteQuery = async (sql) => {
      if (sql === SELECT_QUOTE_FOR_UPDATE_SQL) return { rows: [draftRow()] };
      if (sql.startsWith("UPDATE quotes")) throw new Error("disk full");
      return { rows: [] };
    };
    const server = await listen(appWith(query));
    try {
      const response = await fetch(`${server.url}/quotes/${QUOTE_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "sent" }),
      });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "Internal server error" });
    } finally {
      await server.close();
    }
  });
});
