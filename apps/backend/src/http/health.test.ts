import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { mountHealth } from "./health.js";
import { probeDatabase, type ReadyClient } from "./ready.js";

function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done, reject) => {
            server.close((err) => (err ? reject(err) : done()));
          }),
      });
    });
  });
}

describe("GET /health", () => {
  it("is liveness and does not wait on the database", async () => {
    let probed = false;
    const app = express();
    mountHealth(app, {
      ready: () => {
        probed = true;
        return new Promise(() => {});
      },
    });
    app.use((_req, res) => {
      res.status(404).json({ error: "Not found" });
    });
    const server = await listen(app);
    try {
      const response = await fetch(`${server.url}/health`);
      const body: unknown = await response.json();
      assert.equal(response.status, 200);
      assert.equal((body as { status: string }).status, "ok");
      assert.equal(JSON.stringify(body).includes("ready"), false);
      assert.equal(probed, false);
    } finally {
      await server.close();
    }
  });
});

describe("GET /ready", () => {
  it("returns ready only when the probe succeeds", async () => {
    let ready = false;
    const app = express();
    mountHealth(app, {
      ready: async () => ready,
    });
    const server = await listen(app);
    try {
      const down = await fetch(`${server.url}/ready`);
      const downBody: unknown = await down.json();
      assert.equal(down.status, 503);
      assert.deepEqual(downBody, { status: "not_ready" });

      ready = true;
      const up = await fetch(`${server.url}/ready`);
      const upBody: unknown = await up.json();
      assert.equal(up.status, 200);
      assert.deepEqual(upBody, { status: "ready" });
    } finally {
      await server.close();
    }
  });

  it("hides database errors, hosts, and passwords", async () => {
    const secret = "super-secret-db-password";
    const app = express();
    mountHealth(app, {
      ready: async () => {
        throw new Error(`connect ECONNREFUSED postgresql://app:${secret}@db.internal:5432/quotesnap`);
      },
    });
    const server = await listen(app);
    try {
      const response = await fetch(`${server.url}/ready`);
      const text = await response.text();
      assert.equal(response.status, 503);
      assert.equal(text, JSON.stringify({ status: "not_ready" }));
      assert.equal(text.includes(secret), false);
      assert.equal(text.includes("db.internal"), false);
      assert.equal(text.includes("ECONNREFUSED"), false);
    } finally {
      await server.close();
    }
  });
});

describe("probeDatabase", () => {
  it("returns false and releases the client when SELECT 1 fails", async () => {
    let releases = 0;
    const client: ReadyClient = {
      async query() {
        throw new Error("password=super-secret-db-password host=db.internal");
      },
      release() {
        releases += 1;
        if (releases > 1) throw new Error("double release");
      },
    };
    const ok = await probeDatabase(async () => client);
    assert.equal(ok, false);
    assert.equal(releases, 1);
  });

  it("returns false without a client when connect fails", async () => {
    const ok = await probeDatabase(async () => {
      throw new Error("connection timeout");
    }, 50);
    assert.equal(ok, false);
  });

  it("releases a client when the query hangs past the timeout", async () => {
    let releases = 0;
    const client: ReadyClient = {
      query: () => new Promise(() => {}),
      release(err?: Error) {
        releases += 1;
        assert.ok(err);
      },
    };
    const ok = await probeDatabase(async () => client, 20);
    assert.equal(ok, false);
    assert.equal(releases, 1);
  });

  it("releases a client that arrives after the probe timed out", async () => {
    let releases = 0;
    let giveClient: (client: ReadyClient) => void = () => {};
    const pending = new Promise<ReadyClient>((resolve) => {
      giveClient = resolve;
    });
    const ok = await probeDatabase(() => pending, 20);
    assert.equal(ok, false);
    giveClient({
      async query() {
        return {};
      },
      release() {
        releases += 1;
      },
    });
    await pending;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(releases, 1);
  });

  it("returns true after SELECT 1 and releases once", async () => {
    const queries: string[] = [];
    let releases = 0;
    const client: ReadyClient = {
      async query(sql: string) {
        queries.push(sql);
        return { rows: [{ "?column?": 1 }] };
      },
      release() {
        releases += 1;
      },
    };
    const ok = await probeDatabase(async () => client);
    assert.equal(ok, true);
    assert.deepEqual(queries, ["SELECT 1"]);
    assert.equal(releases, 1);
  });
});
