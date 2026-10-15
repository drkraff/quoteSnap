import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { RequestHandler } from "express";
import { createVoiceDraftHandler } from "./voice-draft.js";
import type { QuotesRouteQuery } from "./quotes-router.js";

const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTE_ID = "11111111-1111-4111-8111-111111111111";

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

describe("GET /voice/draft exclusions", () => {
  it("returns the note and the Not included section together", async () => {
    const sql: string[] = [];
    const query: QuotesRouteQuery = async (text) => {
      sql.push(text);
      if (text.includes("FROM quotes")) {
        return {
          rows: [{
            id: QUOTE_ID,
            status: "draft_local",
            total_cents: 8000,
            client_sentence: "Replace the outlet.",
            exclusions: "permit not included",
            rooms: null,
          }],
        };
      }
      return { rows: [] };
    };
    const app = express();
    app.get("/voice/draft/:quoteId", authenticateAs(), createVoiceDraftHandler(query));
    const server = await listen(app);
    try {
      const response = await fetch(`${server.url}/voice/draft/${QUOTE_ID}`);
      assert.equal(response.status, 200);
      const body = await response.json() as {
        clientSentence: string | null;
        exclusions: string | null;
      };
      assert.equal(body.clientSentence, "Replace the outlet.");
      assert.equal(body.exclusions, "permit not included");
      assert.match(sql[0] ?? "", /exclusions/);
    } finally {
      await server.close();
    }
  });
});
