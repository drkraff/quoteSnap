import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { BODY_TOO_LARGE_MESSAGE, errorHandler } from "../log/http.js";
import {
  DEFAULT_JSON_BODY_LIMIT,
  FEEDBACK_JSON_BODY_LIMIT,
  jsonBodyParser,
  jsonLimitFor,
} from "./json-body.js";

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

describe("jsonLimitFor", () => {
  it("raises the cap only for POST /feedback", () => {
    assert.equal(jsonLimitFor("POST", "/feedback"), FEEDBACK_JSON_BODY_LIMIT);
    assert.equal(jsonLimitFor("post", "/feedback/"), FEEDBACK_JSON_BODY_LIMIT);
    assert.equal(jsonLimitFor("GET", "/feedback"), DEFAULT_JSON_BODY_LIMIT);
    assert.equal(jsonLimitFor("POST", "/quotes"), DEFAULT_JSON_BODY_LIMIT);
    assert.equal(DEFAULT_JSON_BODY_LIMIT, "100kb");
    assert.equal(FEEDBACK_JSON_BODY_LIMIT, "2mb");
  });
});

describe("jsonBodyParser", () => {
  it("accepts a note larger than 100kb on POST /feedback and rejects it elsewhere", async () => {
    const app = express();
    app.use(jsonBodyParser);
    app.post("/feedback", (_req, res) => {
      res.status(204).end();
    });
    app.post("/quotes", (_req, res) => {
      res.status(204).end();
    });
    app.use(errorHandler);
    const server = await listen(app);
    const body = JSON.stringify({ message: "x".repeat(150 * 1024) });
    try {
      const feedback = await fetch(`${server.url}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      assert.equal(feedback.status, 204);

      const quotes = await fetch(`${server.url}/quotes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const quotesBody: unknown = await quotes.json();
      assert.equal(quotes.status, 413);
      assert.deepEqual(quotesBody, { error: BODY_TOO_LARGE_MESSAGE });
    } finally {
      await server.close();
    }
  });
});
