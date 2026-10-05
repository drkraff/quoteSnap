import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createShutdownHandler, installGracefulShutdown } from "./shutdown.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("createShutdownHandler", () => {
  it("closes the server, stops pg-boss, then the pool, once", async () => {
    const order: string[] = [];
    let exitCode: number | null = null;
    const handler = createShutdownHandler({
      closeServer: async () => {
        order.push("server");
      },
      stopBoss: async () => {
        order.push("boss");
      },
      closePool: async () => {
        order.push("pool");
      },
      exit: (code) => {
        exitCode = code;
      },
      logError: () => {
        order.push("log");
      },
    });
    handler();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(order, ["server", "boss", "pool"]);
    assert.equal(exitCode, 0);
  });

  it("exits on a second signal during pg-boss stop without closing twice", async () => {
    let releaseStop: () => void = () => {};
    const stopGate = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    const calls = { server: 0, boss: 0, pool: 0, exit: [] as number[] };
    const handler = createShutdownHandler({
      closeServer: async () => {
        calls.server += 1;
      },
      stopBoss: () => {
        calls.boss += 1;
        return stopGate;
      },
      closePool: async () => {
        calls.pool += 1;
        if (calls.pool > 1) {
          throw new Error("Called end on pool more than once");
        }
      },
      exit: (code) => {
        calls.exit.push(code);
      },
      logError: () => {},
    });
    handler();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.boss, 1);
    assert.equal(calls.exit.length, 0);
    handler();
    assert.deepEqual(calls.exit, [1]);
    releaseStop();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.server, 1);
    assert.equal(calls.boss, 1);
    assert.equal(calls.pool, 0);
    assert.deepEqual(calls.exit, [1]);
  });

  it("does not call pool.end a second time when the first end fails", async () => {
    let ends = 0;
    let exitCode: number | null = null;
    const handler = createShutdownHandler({
      closeServer: async () => {},
      stopBoss: async () => {},
      closePool: async () => {
        ends += 1;
        throw new Error(ends === 1 ? "end failed" : "Called end on pool more than once");
      },
      exit: (code) => {
        exitCode = code;
      },
      logError: () => {},
    });
    handler();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ends, 1);
    assert.equal(exitCode, 1);
  });

  it("exits 1 and still closes the pool when stop fails", async () => {
    const order: string[] = [];
    let exitCode: number | null = null;
    const handler = createShutdownHandler({
      closeServer: async () => {
        order.push("server");
      },
      stopBoss: async () => {
        order.push("boss");
        throw new Error("stop failed");
      },
      closePool: async () => {
        order.push("pool");
      },
      exit: (code) => {
        exitCode = code;
      },
      logError: () => {
        order.push("log");
      },
    });
    handler();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(order, ["server", "boss", "log", "pool"]);
    assert.equal(exitCode, 1);
  });
});

describe("installGracefulShutdown", () => {
  it("registers SIGTERM and SIGINT on the given emitter", async () => {
    const emitter = new EventEmitter();
    let stopped = false;
    installGracefulShutdown({
      signals: emitter,
      closeServer: async () => {},
      stopBoss: async () => {
        stopped = true;
      },
      closePool: async () => {},
      exit: () => {},
      logError: () => {},
    });
    emitter.emit("SIGTERM");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stopped, true);
    assert.equal(emitter.listenerCount("SIGINT"), 1);
    assert.equal(emitter.listenerCount("SIGTERM"), 1);
  });

  it("overlaps SIGTERM and SIGINT onto one shutdown and still exits", async () => {
    const emitter = new EventEmitter();
    let releaseStop: () => void = () => {};
    const stopGate = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    const exits: number[] = [];
    let stops = 0;
    let pools = 0;
    installGracefulShutdown({
      signals: emitter,
      closeServer: async () => {},
      stopBoss: () => {
        stops += 1;
        return stopGate;
      },
      closePool: async () => {
        pools += 1;
        if (pools > 1) throw new Error("Called end on pool more than once");
      },
      exit: (code) => {
        exits.push(code);
      },
      logError: () => {},
    });
    emitter.emit("SIGTERM");
    emitter.emit("SIGINT");
    assert.deepEqual(exits, [1]);
    releaseStop();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stops <= 1, true);
    assert.equal(pools, 0);
    assert.deepEqual(exits, [1]);
  });

  it("index.ts installs shutdown after listen and stops the boss gracefully", () => {
    const source = readFileSync(path.join(here, "../index.ts"), "utf8");
    const listenAt = source.indexOf("app.listen(");
    const installAt = source.indexOf("installGracefulShutdown(");
    assert.ok(listenAt >= 0);
    assert.ok(installAt > listenAt);
    assert.match(source, /graceful:\s*true/);
    assert.match(source, /timeout:\s*20000/);
  });
});
