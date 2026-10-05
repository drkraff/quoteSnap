import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createQuotesRouter } from "../routes/quotes-router.js";
import { SNAPSHOT_EXISTS_ERROR } from "./send-quote.js";
import {
  SEND_RATE_LIMIT_MAX,
  SEND_RATE_LIMIT_MESSAGE,
  SEND_RATE_LIMIT_WINDOW_MS,
  createSendLimiter,
  sendRateLimitKey,
} from "./send-limiter.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const CONTRACTOR_A = "22222222-2222-4222-8222-222222222222";
const CONTRACTOR_B = "33333333-3333-4333-8333-333333333333";

async function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe("send limiter config", () => {
  it("is per contractor and leaves room for the write-once 409", () => {
    assert.ok(SEND_RATE_LIMIT_MAX > 1);
    assert.equal(SEND_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
    assert.equal(sendRateLimitKey(CONTRACTOR_A), `contractor:${CONTRACTOR_A}`);
    assert.notEqual(sendRateLimitKey(CONTRACTOR_A), sendRateLimitKey(CONTRACTOR_B));
    assert.equal(sendRateLimitKey("  "), "contractor:missing");
  });
});

describe("createSendLimiter", () => {
  it("keeps the handler's 409 for a second send and limits later attempts per contractor", async () => {
    const app = express();
    let sends = 0;
    app.post(
      "/quotes/:id/send",
      (req, _res, next) => {
        req.contractor = {
          contractorId: req.header("x-contractor-id") ?? CONTRACTOR_A,
          email: null,
          phone: null,
        };
        next();
      },
      createSendLimiter({ max: 2, validate: false }),
      (_req, res) => {
        sends += 1;
        if (sends === 1) {
          res.status(201).json({ status: "sent" });
          return;
        }
        res.status(409).json({ error: SNAPSHOT_EXISTS_ERROR });
      },
    );
    const server = await listen(app);
    try {
      const first = await fetch(`${server.url}/quotes/${QUOTE_ID}/send`, {
        method: "POST",
        headers: { "x-contractor-id": CONTRACTOR_A },
      });
      assert.equal(first.status, 201);
      const second = await fetch(`${server.url}/quotes/${QUOTE_ID}/send`, {
        method: "POST",
        headers: { "x-contractor-id": CONTRACTOR_A },
      });
      const secondBody: unknown = await second.json();
      assert.equal(second.status, 409);
      assert.deepEqual(secondBody, { error: SNAPSHOT_EXISTS_ERROR });

      const blocked = await fetch(`${server.url}/quotes/${QUOTE_ID}/send`, {
        method: "POST",
        headers: { "x-contractor-id": CONTRACTOR_A },
      });
      const blockedBody: unknown = await blocked.json();
      assert.equal(blocked.status, 429);
      assert.deepEqual(blockedBody, SEND_RATE_LIMIT_MESSAGE);

      const other = await fetch(`${server.url}/quotes/${QUOTE_ID}/send`, {
        method: "POST",
        headers: { "x-contractor-id": CONTRACTOR_B },
      });
      assert.equal(other.status, 409);
    } finally {
      await server.close();
    }
  });
});

describe("POST /quotes/:id/send wiring", () => {
  it("returns 409 from the handler for sends under the cap, then 429", async () => {
    const previousSms = process.env["SMS_SENDER"];
    process.env["SMS_SENDER"] = "dry-run";
    const app = express();
    app.use(express.json());
    app.use(
      "/quotes",
      createQuotesRouter({
        authenticate: (req, _res, next) => {
          req.contractor = {
            contractorId: CONTRACTOR_A,
            email: null,
            phone: null,
          };
          next();
        },
        sendLimiter: createSendLimiter({ max: 2, validate: false }),
        query: async () => ({
          rows: [
            {
              id: QUOTE_ID,
              status: "approved",
              customer_phone: "+15555550100",
              total_cents: 100,
            },
          ],
        }),
        withTransaction: async (fn) =>
          fn(async () => ({
            rows: [
              {
                id: QUOTE_ID,
                status: "approved",
                customer_phone: "+15555550100",
                total_cents: 100,
              },
            ],
          })),
      }),
    );
    const server = await listen(app);
    try {
      const first = await fetch(`${server.url}/quotes/${QUOTE_ID}/send`, { method: "POST" });
      const firstBody = (await first.json()) as { error?: string };
      assert.equal(first.status, 409);
      assert.equal(firstBody.error, "Quote cannot be sent in its current status");

      const second = await fetch(`${server.url}/quotes/${QUOTE_ID}/send`, { method: "POST" });
      assert.equal(second.status, 409);

      const third = await fetch(`${server.url}/quotes/${QUOTE_ID}/send`, { method: "POST" });
      const thirdBody: unknown = await third.json();
      assert.equal(third.status, 429);
      assert.deepEqual(thirdBody, SEND_RATE_LIMIT_MESSAGE);
    } finally {
      if (previousSms === undefined) delete process.env["SMS_SENDER"];
      else process.env["SMS_SENDER"] = previousSms;
      await server.close();
    }
  });

  it("mounts the limiter on the send route after authenticate", () => {
    const source = readFileSync(path.join(here, "../routes/quotes-router.ts"), "utf8");
    const sendAt = source.indexOf('"/:id/send"');
    assert.ok(sendAt >= 0);
    const window = source.slice(sendAt, sendAt + 180);
    assert.match(window, /authenticate,\s*sendLimiter/);
  });
});
