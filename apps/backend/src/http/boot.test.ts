import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBootOrExit } from "./boot.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("runBootOrExit", () => {
  it("does not listen when a step before listen throws", async () => {
    let listened = false;
    let installed = false;
    let code: number | null = null;
    let workers = false;
    await runBootOrExit(
      {
        assertBootEnv: () => {},
        warnOptional: () => {},
        initBoss: async () => {
          workers = true;
          throw new Error("pg-boss failed to connect");
        },
        listen: () => {
          listened = true;
        },
        installShutdown: () => {
          installed = true;
        },
      },
      {
        exit: (next) => {
          code = next;
        },
        logError: () => {},
      },
    );
    assert.equal(workers, true);
    assert.equal(listened, false);
    assert.equal(installed, false);
    assert.equal(code, 1);
  });

  it("does not install shutdown when listen throws", async () => {
    let installed = false;
    let code: number | null = null;
    await runBootOrExit(
      {
        assertBootEnv: () => {},
        warnOptional: () => {},
        initBoss: async () => {},
        listen: () => {
          throw new Error("EADDRINUSE");
        },
        installShutdown: () => {
          installed = true;
        },
      },
      {
        exit: (next) => {
          code = next;
        },
        logError: (err) => {
          assert.equal(err instanceof Error ? err.message : "", "EADDRINUSE");
        },
      },
    );
    assert.equal(installed, false);
    assert.equal(code, 1);
  });

  it("listens and installs shutdown without exiting when boot succeeds", async () => {
    const order: string[] = [];
    await runBootOrExit(
      {
        assertBootEnv: () => {
          order.push("env");
        },
        warnOptional: () => {
          order.push("warn");
        },
        initBoss: async () => {
          order.push("boss");
        },
        listen: () => {
          order.push("listen");
        },
        installShutdown: () => {
          order.push("shutdown");
        },
      },
      {
        exit: () => {
          order.push("exit");
        },
        logError: () => {
          order.push("log");
        },
      },
    );
    assert.deepEqual(order, ["env", "warn", "boss", "listen", "shutdown"]);
  });
});

describe("index boot wiring", () => {
  it("logs the listen port and mounts /health plus /ready through the boot helper", () => {
    const source = readFileSync(path.join(here, "../index.ts"), "utf8");
    assert.match(source, /msg: "server_listening", port: PORT/);
    assert.match(source, /mountHealth\(/);
    assert.match(source, /probeDatabase\(/);
    assert.match(source, /runBootOrExit\(/);
    const start = source.slice(source.indexOf("async function startServer"));
    const listenAt = start.indexOf("app.listen(");
    const installAt = start.indexOf("installGracefulShutdown(");
    assert.ok(listenAt >= 0);
    assert.ok(installAt > listenAt);
    assert.equal(source.includes("DATABASE_URL"), false);
    assert.equal(source.includes("super-secret"), false);
  });
});
