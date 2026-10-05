import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { generateApprovalToken, hashApprovalToken } from "./approval-token.js";
import { renderNotFoundPage } from "./approval-page.js";
import { MARK_QUOTE_APPROVED_SQL } from "./approval-page.js";
import {
  APPROVAL_RATE_LIMIT_MAX,
  APPROVAL_RATE_LIMIT_MESSAGE,
  APPROVAL_RATE_LIMIT_WINDOW_MS,
  APPROVAL_SECURITY_HEADERS,
  createApprovalLimiter,
} from "./approval-security.js";
import { createApprovalRouter } from "../routes/approval-router.js";
import type { SnapshotQueryFn } from "./quote-snapshot.js";

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

describe("approval security headers and rate limit", () => {
  it("uses a 60-request / 15-minute public cap and the locked-down headers", () => {
    assert.equal(APPROVAL_RATE_LIMIT_MAX, 60);
    assert.equal(APPROVAL_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
    assert.equal(APPROVAL_SECURITY_HEADERS["X-Content-Type-Options"], "nosniff");
    assert.equal(APPROVAL_SECURITY_HEADERS["X-Frame-Options"], "DENY");
    assert.equal(APPROVAL_SECURITY_HEADERS["Cache-Control"], "no-store");
    assert.match(APPROVAL_SECURITY_HEADERS["Content-Security-Policy"], /script-src 'none'/);
    assert.match(APPROVAL_SECURITY_HEADERS["Content-Security-Policy"], /frame-ancestors 'none'/);
  });

  it("returns the same not-found page for unknown and malformed tokens, with security headers", async () => {
    const token = generateApprovalToken();
    const queryFn: SnapshotQueryFn = async (_sql, params = []) => {
      if (params[0] !== hashApprovalToken(token)) {
        return { rows: [] };
      }
      return {
        rows: [{
          expires_at: new Date("2026-10-07T00:00:00.000Z"),
          quote_id: "11111111-1111-4111-8111-111111111111",
          payload: {
            customerPhone: "+15555550100",
            totalCents: 100,
            clientSentence: null,
            privateNote: "do not render",
            lineItems: [
              {
                name: "<script>alert(1)</script>",
                quantity: 1,
                unitPriceCents: 100,
                unit: null,
                roomName: null,
              },
            ],
          },
          contractor_display_name: "Sam",
          contractor_trade: "plumbing",
          status: "sent",
          approved_at: null,
          declined_at: null,
        }],
      };
    };
    const app = express();
    app.use("/q", createApprovalRouter({
      queryFn,
      now: () => new Date("2026-10-04T00:00:00.000Z"),
      limiter: createApprovalLimiter({ max: 20, validate: false }),
    }));
    const server = await listen(app);
    try {
      const unknown = await fetch(`${server.url}/q/${generateApprovalToken()}`);
      const malformed = await fetch(`${server.url}/q/${encodeURIComponent("<script>")}`);
      const unknownHtml = await unknown.text();
      const malformedHtml = await malformed.text();
      assert.equal(unknown.status, 404);
      assert.equal(malformed.status, 404);
      assert.equal(unknownHtml, malformedHtml);
      assert.equal(unknownHtml, renderNotFoundPage());
      for (const response of [unknown, malformed]) {
        for (const [name, value] of Object.entries(APPROVAL_SECURITY_HEADERS)) {
          assert.equal(response.headers.get(name.toLowerCase()), value);
        }
      }

      const page = await fetch(`${server.url}/q/${token}`);
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.equal(page.headers.get("x-content-type-options"), "nosniff");
      assert.equal(page.headers.get("cache-control"), "no-store");
      assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      assert.equal(html.toLowerCase().includes("<script"), false);
      assert.equal(html.includes("do not render"), false);
      assert.equal(html.includes("+15555550100"), false);
      assert.match(html, />Approve</);
      assert.match(html, />Decline</);
    } finally {
      await server.close();
    }
  });

  it("returns 429 after the public cap, including the security headers", async () => {
    const app = express();
    app.use("/q", createApprovalRouter({
      queryFn: async () => ({ rows: [] }),
      limiter: createApprovalLimiter({ max: 2, validate: false }),
    }));
    const server = await listen(app);
    try {
      const token = generateApprovalToken();
      for (let i = 0; i < 2; i++) {
        const ok = await fetch(`${server.url}/q/${token}`);
        assert.equal(ok.status, 404);
      }
      const blocked = await fetch(`${server.url}/q/${token}`);
      assert.equal(blocked.status, 429);
      assert.deepEqual(await blocked.json(), APPROVAL_RATE_LIMIT_MESSAGE);
      assert.equal(blocked.headers.get("x-content-type-options"), "nosniff");
      assert.equal(blocked.headers.get("cache-control"), "no-store");
    } finally {
      await server.close();
    }
  });

  it("puts a no-referrer meta on the public HTML so the token is not leaked by the page", () => {
    assert.match(renderNotFoundPage(), /<meta name="referrer" content="no-referrer">/);
  });

  it("rejects a cross-site approve POST before the decision query", async () => {
    const token = generateApprovalToken();
    const calls: string[] = [];
    const queryFn: SnapshotQueryFn = async (sql) => {
      calls.push(sql);
      return { rows: [] };
    };
    const app = express();
    app.use("/q", createApprovalRouter({
      queryFn,
      now: () => new Date("2026-10-04T00:00:00.000Z"),
      limiter: createApprovalLimiter({ max: 20, validate: false }),
    }));
    const server = await listen(app);
    try {
      const cross = await fetch(`${server.url}/q/${token}/approve`, {
        method: "POST",
        headers: { origin: "https://evil.example" },
      });
      const html = await cross.text();
      assert.equal(cross.status, 403);
      assert.equal(html, renderNotFoundPage());
      assert.equal(calls.includes(MARK_QUOTE_APPROVED_SQL), false);
      assert.equal(calls.length, 0);

      const fetchSite = await fetch(`${server.url}/q/${token}/approve`, {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site" },
      });
      assert.equal(fetchSite.status, 403);
      assert.equal(calls.length, 0);

      const same = await fetch(`${server.url}/q/${token}/approve`, { method: "POST" });
      assert.notEqual(same.status, 403);
      assert.ok(calls.length > 0);

      const origin = new URL(server.url).origin;
      const browser = await fetch(`${server.url}/q/${token}/decline`, {
        method: "POST",
        headers: { origin },
      });
      assert.notEqual(browser.status, 403);
    } finally {
      await server.close();
    }
  });
});
