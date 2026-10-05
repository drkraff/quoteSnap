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
    handler();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(order, ["server", "boss", "pool"]);
    assert.equal(exitCode, 0);
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
