import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import {
  AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_MESSAGE,
  AUTH_RATE_LIMIT_WINDOW_MS,
  createAuthLimiter,
} from "./auth-limiter.js";

async function withLimitedApp(
  max: number,
  fn: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.post(
    "/auth/register",
    createAuthLimiter({ max, validate: false }),
    (_req, res) => {
      res.status(201).json({ ok: true });
    },
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${port}/auth/register`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function post(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { method: "POST" });
  return { status: res.status, body: await res.json() };
}

describe("authLimiter config", () => {
  it("matches the existing login/refresh cap (6 per 15 minutes)", () => {
    assert.equal(AUTH_RATE_LIMIT_MAX, 6);
    assert.equal(AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
    assert.deepEqual(AUTH_RATE_LIMIT_MESSAGE, {
      error: "Too many attempts, please try again later",
    });
  });
});

describe("createAuthLimiter", () => {
  it("allows requests up to the cap", async () => {
    await withLimitedApp(3, async (url) => {
      for (let i = 0; i < 3; i++) {
        const res = await post(url);
        assert.equal(res.status, 201);
        assert.deepEqual(res.body, { ok: true });
      }
    });
  });

  it("returns 429 with the auth message after the cap, including successful signups", async () => {
    await withLimitedApp(3, async (url) => {
      for (let i = 0; i < 3; i++) {
        const res = await post(url);
        assert.equal(res.status, 201);
      }

      const blocked = await post(url);
      assert.equal(blocked.status, 429);
      assert.deepEqual(blocked.body, AUTH_RATE_LIMIT_MESSAGE);
    });
  });

  it("does not share a store across limiter instances", async () => {
    const app = express();
    app.post("/a", createAuthLimiter({ max: 1, validate: false }), (_req, res) => {
      res.status(201).json({ bucket: "a" });
    });
    app.post("/b", createAuthLimiter({ max: 1, validate: false }), (_req, res) => {
      res.status(201).json({ bucket: "b" });
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const { port } = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${port}`;
      assert.equal((await post(`${base}/a`)).status, 201);
      assert.equal((await post(`${base}/b`)).status, 201);
      assert.equal((await post(`${base}/a`)).status, 429);
      assert.equal((await post(`${base}/b`)).status, 429);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
