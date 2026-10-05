import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTransaction, type TxClient } from "./transaction.js";

const here = path.dirname(fileURLToPath(import.meta.url));

type FakeClient = TxClient & {
  released: number;
  releaseErr: Error | undefined;
  queries: string[];
  emitError: (err: Error) => void;
};

function fakeClient(options?: { failRollback?: boolean }): FakeClient {
  const emitter = new EventEmitter();
  const client: FakeClient = {
    released: 0,
    releaseErr: undefined,
    queries: [],
    async query(sql: string) {
      client.queries.push(sql);
      if (sql === "ROLLBACK" && options?.failRollback) {
        throw new Error("rollback failed");
      }
      if (sql === "FAIL") throw new Error("statement failed");
      return { rows: [] };
    },
    release(err?: Error) {
      client.released += 1;
      if (client.released > 1) {
        throw new Error("Release called on client which has already been released to the pool.");
      }
      client.releaseErr = err;
    },
    on: emitter.on.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    emitError(err: Error) {
      emitter.emit("error", err);
    },
  };
  return client;
}

describe("runTransaction", () => {
  it("commits and releases one client", async () => {
    const client = fakeClient();
    const result = await runTransaction(async () => client, async (query) => {
      await query("SELECT 1");
      return "ok";
    });
    assert.equal(result, "ok");
    assert.deepEqual(client.queries, ["BEGIN", "SELECT 1", "COMMIT"]);
    assert.equal(client.released, 1);
    assert.equal(client.releaseErr, undefined);
  });

  it("releases the approval-path client when the body throws", async () => {
    const client = fakeClient();
    await assert.rejects(
      () =>
        runTransaction(async () => client, async (query) => {
          await query("FAIL");
        }),
      /statement failed/,
    );
    assert.ok(client.queries.includes("ROLLBACK"));
    assert.equal(client.queries.includes("COMMIT"), false);
    assert.equal(client.released, 1);
    assert.equal(client.releaseErr, undefined);
  });

  it("destroys the client once when rollback fails", async () => {
    const client = fakeClient({ failRollback: true });
    await assert.rejects(
      () =>
        runTransaction(async () => client, async () => {
          throw new Error("approval write failed");
        }),
      /approval write failed/,
    );
    assert.equal(client.released, 1);
    assert.ok(client.releaseErr instanceof Error);
  });

  it("does not turn a checked-out client error into an uncaught exception", async () => {
    const uncaught: unknown[] = [];
    const onUncaught = (err: unknown) => {
      uncaught.push(err);
    };
    process.on("uncaughtException", onUncaught);
    const client = fakeClient();
    try {
      await runTransaction(async () => client, async (query) => {
        await query("SELECT 1");
        await new Promise<void>((resolve) => {
          setImmediate(() => {
            client.emitError(new Error("connection terminated"));
            resolve();
          });
        });
      });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(uncaught.length, 0);
      assert.equal(client.released, 1);
    } finally {
      process.removeListener("uncaughtException", onUncaught);
    }
  });

  it("returns every client after concurrent approval and sync work", async () => {
    const max = 2;
    let inUse = 0;
    let peak = 0;
    const waiters: Array<() => void> = [];
    async function connect(): Promise<FakeClient> {
      if (inUse >= max) {
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
      }
      inUse += 1;
      peak = Math.max(peak, inUse);
      const client = fakeClient();
      const orig = client.release.bind(client);
      client.release = (err?: Error) => {
        orig(err);
        inUse -= 1;
        waiters.shift()?.();
      };
      return client;
    }

    const tasks = Array.from({ length: 8 }, (_, index) =>
      runTransaction(connect, async (query) => {
        await query(index % 3 === 0 ? "FAIL" : "UPDATE quotes SET status = 'approved'");
      }),
    );
    const results = await Promise.allSettled(tasks);
    assert.equal(results.filter((result) => result.status === "rejected").length, 3);
    assert.equal(peak <= max, true);
    assert.equal(inUse, 0);
  });
});

describe("approval and sync check out through withTransaction", () => {
  it("does not open a second client beside the transaction helper", () => {
    const approval = readFileSync(path.join(here, "../routes/approval.ts"), "utf8");
    const quotes = readFileSync(path.join(here, "../routes/quotes.ts"), "utf8");
    const voice = readFileSync(path.join(here, "../workers/voice-processor.ts"), "utf8");
    assert.match(approval, /withTransaction/);
    assert.equal(approval.includes("pool.connect"), false);
    assert.match(quotes, /withTransaction/);
    assert.equal(quotes.includes("pool.connect"), false);
    assert.match(voice, /withTransaction/);
    assert.equal(voice.includes("pool.connect"), false);
  });
});
