import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createAuthLimiter } from "../auth/auth-limiter.js";
import { applyApiHardening } from "./api-hardening.js";

const here = path.dirname(fileURLToPath(import.meta.url));

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

async function post(
  url: string,
  forwardedFor: string,
): Promise<{ status: number; body: { ok?: boolean; ip?: string } }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-forwarded-for": forwardedFor },
  });
  return { status: res.status, body: await res.json() as { ok?: boolean; ip?: string } };
}

function proxyAddrVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require("proxy-addr/package.json") as { version: string };
  return pkg.version;
}

/** 2.0.8 fixes GHSA-jqcg-44mw-7w3h. Later 2.x and 3+ stay acceptable. */
function isPatchedProxyAddr(version: string): boolean {
  const parts = version.split(".").map((part) => Number(part));
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  if (major > 2) return true;
  if (major < 2) return false;
  if (minor > 0) return true;
  return patch >= 8;
}

describe("applyApiHardening", () => {
  it("trusts one hop and loads a patched proxy-addr", () => {
    const app = express();
    applyApiHardening(app);
    assert.equal(app.get("trust proxy"), 1);
    const version = proxyAddrVersion();
    assert.equal(isPatchedProxyAddr(version), true, version);
  });

  it("keys the production auth limiter on each forwarded client and sets API headers", async () => {
    const app = express();
    applyApiHardening(app);
    app.post("/auth/register", createAuthLimiter({ max: 1 }), (req, res) => {
      res.status(201).json({ ok: true, ip: req.ip });
    });
    const server = await listen(app);
    try {
      const first = await post(`${server.url}/auth/register`, "203.0.113.9");
      const second = await post(`${server.url}/auth/register`, "203.0.113.10");
      const third = await post(`${server.url}/auth/register`, "203.0.113.9");
      assert.equal(first.status, 201);
      assert.equal(first.body.ip, "203.0.113.9");
      assert.equal(second.status, 201);
      assert.equal(second.body.ip, "203.0.113.10");
      assert.equal(third.status, 429);
      const probe = await fetch(`${server.url}/auth/register`, { method: "POST" });
      assert.equal(probe.headers.get("x-content-type-options"), "nosniff");
      assert.equal(probe.headers.get("x-frame-options"), "DENY");
      assert.equal(probe.headers.get("referrer-policy"), "no-referrer");
      assert.equal(probe.headers.get("x-powered-by"), null);

      const spoofed = await post(
        `${server.url}/auth/register`,
        "198.51.100.8, 203.0.113.50",
      );
      assert.equal(spoofed.status, 201);
      assert.equal(spoofed.body.ip, "203.0.113.50");
    } finally {
      await server.close();
    }
  });
});

describe("index applies API hardening before routes", () => {
  it("calls applyApiHardening before the auth router is mounted", () => {
    const source = readFileSync(path.join(here, "../index.ts"), "utf8");
    const hardenAt = source.indexOf("applyApiHardening(");
    const authAt = source.indexOf('app.use("/auth"');
    assert.ok(hardenAt >= 0);
    assert.ok(authAt > hardenAt);
  });
});
