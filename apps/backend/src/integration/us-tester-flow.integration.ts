/**
 * US tester path against live Postgres.
 * Sign up, save United States with sales tax 0, write lines, send, then
 * fetch the customer document send returns. PDF bytes are printed on the
 * phone from this same snapshot; the API document is the approval page.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { runMigrations } from "../db/migrate.js";
import pool from "../db/connection.js";
import { router as authRouter } from "../routes/auth.js";
import { router as onboardingRouter } from "../routes/onboarding.js";
import { router as quotesRouter } from "../routes/quotes.js";
import { router as approvalRouter } from "../routes/approval.js";

if (!process.env["JWT_ACCESS_SECRET"] || process.env["JWT_ACCESS_SECRET"].length < 32) {
  process.env["JWT_ACCESS_SECRET"] = "integration-test-jwt-secret-32-chars-min";
}
process.env["SMS_SENDER"] = "dry-run";

type Json = Record<string, unknown>;

function apiApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  app.use("/onboarding", onboardingRouter);
  app.use("/quotes", quotesRouter);
  app.use("/q", approvalRouter);
  return app;
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

async function sendJson(
  url: string,
  init: { method?: string; token?: string; body?: unknown },
): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = {};
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(url, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = await response.json() as Json;
  return { status: response.status, json };
}

describe("US tester flow", { concurrency: false }, () => {
  before(async () => {
    await runMigrations();
  });

  after(async () => {
    await pool.end();
  });

  it("signs up a US contractor, sends a quote at tax 0, and hides it from another contractor", async () => {
    const app = apiApp();
    const server = await listen(app);
    const password = "tester-pass-1";
    try {
      const signedUp = await sendJson(`${server.url}/auth/register`, {
        body: {
          email: `us-${randomUUID()}@integration.test`,
          password,
          displayName: "Ada Electric",
        },
      });
      assert.equal(signedUp.status, 201, JSON.stringify(signedUp.json));
      const accessToken = signedUp.json.accessToken;
      assert.equal(typeof accessToken, "string");
      const token = accessToken as string;

      const profile = await sendJson(`${server.url}/onboarding/profile`, {
        token,
        body: {
          trade: "electrical",
          hourlyRateCents: 7500,
          currencyCode: "USD",
          unitSystem: "imperial",
          vatPercent: 0,
          countryCode: "US",
        },
      });
      assert.equal(profile.status, 200, JSON.stringify(profile.json));
      const contractor = profile.json.contractor as Json;
      assert.equal(contractor.countryCode, "US");
      assert.equal(contractor.currencyCode, "USD");
      assert.equal(contractor.unitSystem, "imperial");
      assert.equal(contractor.vatPercent, 0);
      assert.equal(contractor.trade, "electrical");
      assert.equal(contractor.hourlyRateCents, 7500);

      const created = await sendJson(`${server.url}/quotes`, {
        token,
        body: {
          clientKey: randomUUID(),
          status: "draft_local",
          totalCents: 0,
          customerName: "Jordan Lee",
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.json));
      const quoteId = (created.json.quote as Json).id;
      assert.equal(typeof quoteId, "string");

      const drafted = await sendJson(`${server.url}/quotes/${quoteId as string}`, {
        method: "PUT",
        token,
        body: {
          lineItems: [
            {
              name: "12/2 cable",
              quantity: 10,
              unitPriceCents: 450,
              unit: "foot",
              catalogItemId: null,
            },
            {
              name: "Labor",
              quantity: 2,
              unitPriceCents: 7500,
              unit: "hour",
              catalogItemId: null,
            },
          ],
        },
      });
      assert.equal(drafted.status, 200, JSON.stringify(drafted.json));

      const sent = await sendJson(`${server.url}/quotes/${quoteId as string}/send`, {
        token,
        body: { customerPhone: "5551234567" },
      });
      assert.equal(sent.status, 201, JSON.stringify(sent.json));
      assert.equal(sent.json.status, "sent");
      assert.equal(typeof sent.json.approvalUrl, "string");
      const approvalUrl = new URL(sent.json.approvalUrl as string);
      assert.match(approvalUrl.pathname, /^\/q\/[A-Za-z0-9_-]{43}$/);

      const owned = await sendJson(`${server.url}/quotes/${quoteId as string}`, { token });
      assert.equal(owned.status, 200, JSON.stringify(owned.json));
      const ownedQuote = owned.json.quote as Json;
      assert.equal(ownedQuote.status, "sent");
      assert.equal(typeof ownedQuote.sentAt, "string");
      assert.equal(ownedQuote.totalCents, 19500);
      assert.equal(ownedQuote.customerName, "Jordan Lee");
      const lines = owned.json.lineItems as Json[];
      assert.equal(lines.length, 2);
      const cable = lines.find((line) => line.name === "12/2 cable");
      const labor = lines.find((line) => line.name === "Labor");
      assert.equal(cable?.quantity, 10);
      assert.equal(cable?.unit, "foot");
      assert.equal(cable?.unitPriceCents, 450);
      assert.equal(labor?.quantity, 2);
      assert.equal(labor?.unit, "hour");
      assert.equal(labor?.unitPriceCents, 7500);

      const document = await fetch(`${server.url}${approvalUrl.pathname}`);
      const html = await document.text();
      assert.equal(document.status, 200, html);
      assert.match(document.headers.get("content-type") ?? "", /text\/html/);
      assert.match(html, /Ada Electric/);
      assert.match(html, /Electrical/);
      assert.match(html, /12\/2 Cable/);
      assert.match(html, /Labor/);
      assert.match(html, /10 ft/);
      assert.match(html, /2 hours/);
      assert.match(html, /\$4\.50/);
      assert.match(html, /\$45\.00/);
      assert.match(html, /\$75\.00/);
      assert.match(html, /\$150\.00/);
      assert.match(html, /Sales tax 0%/);
      assert.match(html, /\$0\.00/);
      assert.match(html, /\$195\.00/);
      assert.equal(html.includes("VAT"), false);
      assert.equal(html.includes("₪"), false);

      const other = await sendJson(`${server.url}/auth/register`, {
        body: {
          email: `other-${randomUUID()}@integration.test`,
          password,
          displayName: "Other Co",
        },
      });
      assert.equal(other.status, 201, JSON.stringify(other.json));
      const otherToken = other.json.accessToken as string;

      const hidden = await sendJson(`${server.url}/quotes/${quoteId as string}`, {
        token: otherToken,
      });
      assert.equal(hidden.status, 404);
      assert.deepEqual(hidden.json, { error: "Quote not found" });

      const hiddenList = await sendJson(`${server.url}/quotes`, { token: otherToken });
      assert.equal(hiddenList.status, 200, JSON.stringify(hiddenList.json));
      const quotes = hiddenList.json.quotes as Json[];
      assert.equal(quotes.some((row) => row.id === quoteId), false);

      const hiddenWrite = await sendJson(`${server.url}/quotes/${quoteId as string}`, {
        method: "PUT",
        token: otherToken,
        body: {
          lineItems: [{
            name: "Changed",
            quantity: 1,
            unitPriceCents: 100,
            catalogItemId: null,
          }],
        },
      });
      assert.equal(hiddenWrite.status, 404);
      assert.deepEqual(hiddenWrite.json, { error: "Quote not found" });

      const stillOwned = await sendJson(`${server.url}/quotes/${quoteId as string}`, { token });
      assert.equal(stillOwned.status, 200);
      assert.equal((stillOwned.json.quote as Json).totalCents, 19500);
      assert.equal((stillOwned.json.lineItems as Json[]).length, 2);
    } finally {
      await server.close();
    }
  });
});
