import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { RequestHandler } from "express";
import { createQuotesRouter, type QuotesRouteQuery } from "./quotes-router.js";
import { createVoiceDraftHandler } from "./voice-draft.js";

const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VALID_ID = "11111111-1111-4111-8111-111111111111";
const VALID_PHOTO_ID = "22222222-2222-4222-8222-222222222222";
const BAD_ID = "not-a-uuid";

const here = path.dirname(fileURLToPath(import.meta.url));

function authenticateAs(): RequestHandler {
  return (req, _res, next) => {
    req.contractor = { contractorId: CONTRACTOR_ID, email: null, phone: null };
    next();
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

describe("malformed quote ids", () => {
  it("returns the existing not-found body and does not query", async () => {
    const calls: string[] = [];
    const query: QuotesRouteQuery = async (sql) => {
      calls.push(sql);
      return { rows: [] };
    };
    let transactions = 0;
    let downloads = 0;
    const previousSender = process.env["SMS_SENDER"];
    process.env["SMS_SENDER"] = "twilio";
    const app = express();
    app.use(express.json());
    const authenticate = authenticateAs();
    app.use("/quotes", createQuotesRouter({
      query,
      withTransaction: async (fn) => {
        transactions += 1;
        return fn(query);
      },
      authenticate,
      getFromR2: async () => {
        downloads += 1;
        return Buffer.from("nope");
      },
    }));
    app.get("/voice/draft/:quoteId", authenticate, createVoiceDraftHandler(query));
    const server = await listen(app);
    try {
      const cases: { method: string; path: string; body?: unknown; error: string }[] = [
        { method: "GET", path: `/quotes/${BAD_ID}`, error: "Quote not found" },
        { method: "PUT", path: `/quotes/${BAD_ID}`, body: { totalCents: -1 }, error: "Quote not found" },
        { method: "POST", path: `/quotes/${BAD_ID}/send`, body: {}, error: "Quote not found" },
        { method: "POST", path: `/quotes/${BAD_ID}/photos`, body: {}, error: "Quote not found" },
        { method: "PATCH", path: `/quotes/${BAD_ID}/archive`, body: { archived: true }, error: "Quote not found" },
        { method: "GET", path: `/quotes/${BAD_ID}/photos/${VALID_PHOTO_ID}`, error: "Photo not found" },
        { method: "GET", path: `/quotes/${VALID_ID}/photos/${BAD_ID}`, error: "Photo not found" },
        { method: "GET", path: `/voice/draft/${BAD_ID}`, error: "Draft not found" },
      ];
      for (const item of cases) {
        const response = await fetch(`${server.url}${item.path}`, {
          method: item.method,
          headers: { "content-type": "application/json" },
          body: item.body === undefined ? undefined : JSON.stringify(item.body),
        });
        assert.equal(response.status, 404, item.path);
        assert.deepEqual(await response.json(), { error: item.error }, item.path);
      }
      assert.equal(calls.length, 0);
      assert.equal(transactions, 0);
      assert.equal(downloads, 0);

      const missing = await fetch(`${server.url}/quotes/${VALID_ID}`);
      assert.equal(missing.status, 404);
      assert.deepEqual(await missing.json(), { error: "Quote not found" });
      assert.equal(calls.length, 1);

      const upper = await fetch(`${server.url}/quotes/${VALID_ID.toUpperCase()}`);
      assert.equal(upper.status, 404);
      assert.deepEqual(await upper.json(), { error: "Quote not found" });
      assert.equal(calls.length, 2);

      const badBody = await fetch(`${server.url}/quotes/${VALID_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ totalCents: -1 }),
      });
      assert.equal(badBody.status, 400);
      assert.equal(transactions, 0);

      const send = await fetch(`${server.url}/quotes/${VALID_ID}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(send.status, 501);
      assert.equal(transactions, 0);

      const draft = await fetch(`${server.url}/voice/draft/${VALID_ID}`);
      assert.equal(draft.status, 404);
      assert.deepEqual(await draft.json(), { error: "Draft not found" });
      assert.ok(calls.length > 2);
    } finally {
      if (previousSender === undefined) {
        delete process.env["SMS_SENDER"];
      } else {
        process.env["SMS_SENDER"] = previousSender;
      }
      await server.close();
    }
  });

  it("wires the voice draft route to the shared handler", () => {
    const src = readFileSync(path.join(here, "voice.ts"), "utf8");
    assert.match(src, /createVoiceDraftHandler\(query\)/);
    assert.match(src, /\/draft\/:quoteId/);
    const quotes = readFileSync(path.join(here, "quotes.ts"), "utf8");
    assert.match(quotes, /createQuotesRouter\(/);
  });
});
