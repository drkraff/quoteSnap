import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  finishMigrationProcess,
  runMigrationFiles,
  type MigrationClient,
  type MigrationDb,
} from "./migrate-runner.js";

const SECRET = "super-secret-db-password";
const FILES = [
  "001_foundation.sql",
  "023_quote_snapshot_delete.sql",
  "024_catalog_client_key.sql",
];

type FakeClient = MigrationClient & {
  released: number;
  lastReleaseErr: Error | undefined;
  emitError: (err: Error) => void;
};

function fakeClient(onQuery?: (sql: string, client: FakeClient) => void): FakeClient {
  const emitter = new EventEmitter();
  const client = {
    released: 0,
    lastReleaseErr: undefined as Error | undefined,
    async query(sql: string) {
      onQuery?.(sql, client);
      return { rows: [] };
    },
    release(err?: Error) {
      client.released += 1;
      if (client.released > 1) {
        throw new Error("Release called on client which has already been released to the pool.");
      }
      client.lastReleaseErr = err;
    },
    on: emitter.on.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    emitError(err: Error) {
      emitter.emit("error", err);
    },
  };
  return client;
}

function memoryDb(options?: {
  failFile?: string;
  failRollback?: boolean;
}): {
  db: MigrationDb;
  applied: Set<string>;
  executed: string[];
  clients: FakeClient[];
} {
  const applied = new Set<string>();
  const executed: string[] = [];
  const clients: FakeClient[] = [];
  const db: MigrationDb = {
    async query(sql: string) {
      if (sql.includes("FROM _migrations")) {
        return { rows: [...applied].sort().map((name) => ({ name })) };
      }
      return { rows: [] };
    },
    async connect() {
      const client = fakeClient((sql) => {
        if (sql.startsWith("-- migration ")) {
          const name = sql.slice("-- migration ".length).trim();
          if (options?.failFile === name) {
            throw new Error(`boom applying ${name}`);
          }
          executed.push(name);
        }
        if (sql.startsWith("INSERT INTO _migrations")) {
          const match = /VALUES \(\$1\)/.test(sql);
          assert.equal(match, true);
        }
        if (sql === "ROLLBACK" && options?.failRollback) {
          throw new Error("rollback failed");
        }
      });
      const origQuery = client.query.bind(client);
      client.query = async (sql: string, params?: unknown[]) => {
        if (sql.startsWith("INSERT INTO _migrations")) {
          applied.add(String(params?.[0]));
        }
        return origQuery(sql);
      };
      clients.push(client);
      return client;
    },
  };
  return { db, applied, executed, clients };
}

function io(readCounts: Map<string, number>) {
  return {
    listSqlFiles: () => FILES,
    readSql: (filename: string) => {
      readCounts.set(filename, (readCounts.get(filename) ?? 0) + 1);
      return `-- migration ${filename}`;
    },
    info: () => {},
  };
}

describe("runMigrationFiles", () => {
  it("re-runs every file including 023 as a skip and logs counts without secrets", async () => {
    const store = memoryDb();
    const reads = new Map<string, number>();
    const lines: string[] = [];
    const original = console.info;
    console.info = (line?: unknown) => {
      lines.push(String(line));
    };
    const previousUrl = process.env["DATABASE_URL"];
    process.env["DATABASE_URL"] = `postgresql://app:${SECRET}@db.internal:5432/quotesnap`;
    try {
      const first = await runMigrationFiles(store.db, io(reads));
      const second = await runMigrationFiles(store.db, io(reads));
      assert.deepEqual(first, { applied: 3, skipped: 0 });
      assert.deepEqual(second, { applied: 0, skipped: 3 });
      assert.deepEqual(store.executed, FILES);
      assert.equal(reads.get("023_quote_snapshot_delete.sql"), 1);
      assert.equal(reads.get("024_catalog_client_key.sql"), 1);
      const summaries = lines.filter((line) => line.includes("migrations_complete"));
      assert.equal(summaries.length, 2);
      const rerun = JSON.parse(summaries[1]!) as { applied: number; skipped: number };
      assert.equal(rerun.applied, 0);
      assert.equal(rerun.skipped, 3);
      assert.equal(summaries.some((line) => line.includes(SECRET)), false);
      assert.equal(summaries.some((line) => line.includes("db.internal")), false);
      assert.equal(summaries.some((line) => line.includes("Applied migration:")), false);
      for (const client of store.clients) {
        assert.equal(client.released, 1);
      }
    } finally {
      console.info = original;
      if (previousUrl === undefined) delete process.env["DATABASE_URL"];
      else process.env["DATABASE_URL"] = previousUrl;
    }
  });

  it("rolls back a failed file, releases clients, and does not report completion", async () => {
    const store = memoryDb({ failFile: "023_quote_snapshot_delete.sql" });
    const reads = new Map<string, number>();
    const lines: string[] = [];
    const original = console.info;
    console.info = (line?: unknown) => {
      lines.push(String(line));
    };
    try {
      await assert.rejects(
        () => runMigrationFiles(store.db, io(reads)),
        /Migration failed: 023_quote_snapshot_delete\.sql/,
      );
      assert.equal(store.applied.has("001_foundation.sql"), true);
      assert.equal(store.applied.has("023_quote_snapshot_delete.sql"), false);
      assert.equal(store.executed.includes("023_quote_snapshot_delete.sql"), false);
      assert.equal(lines.some((line) => line.includes("migrations_complete")), false);
      for (const client of store.clients) {
        assert.equal(client.released, 1);
      }
      const failed = store.clients.find((client) => client.lastReleaseErr);
      assert.ok(failed);
    } finally {
      console.info = original;
    }
  });

  it("releases the migration client when rollback itself throws", async () => {
    const store = memoryDb({
      failFile: "023_quote_snapshot_delete.sql",
      failRollback: true,
    });
    await assert.rejects(() => runMigrationFiles(store.db, io(new Map())));
    for (const client of store.clients) {
      assert.equal(client.released, 1);
    }
  });

  it("treats a client error during apply as a logged failure, not an uncaught exception", async () => {
    const uncaught: unknown[] = [];
    const logged: string[] = [];
    const onUncaught = (err: unknown) => {
      uncaught.push(err);
    };
    const originalError = console.error;
    console.error = (line?: unknown) => {
      logged.push(String(line));
    };
    process.on("uncaughtException", onUncaught);
    const store = memoryDb();
    const db: MigrationDb = {
      query: store.db.query,
      async connect() {
        const client = (await store.db.connect()) as FakeClient;
        const orig = client.query.bind(client);
        client.query = async (sql: string, params?: unknown[]) => {
          if (sql.startsWith("-- migration ")) {
            client.emitError(
              new Error(`connection terminated postgresql://app:${SECRET}@db.internal:5432/quotesnap`),
            );
          }
          return orig(sql, params);
        };
        return client;
      },
    };
    try {
      await runMigrationFiles(db, io(new Map()));
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(uncaught.length, 0);
      assert.equal(logged.some((line) => line.includes(SECRET)), false);
      assert.match(logged.join("\n"), /\[redacted\]@/);
    } finally {
      console.error = originalError;
      process.removeListener("uncaughtException", onUncaught);
    }
  });
});

describe("finishMigrationProcess", () => {
  it("exits 1 and does not start listening when migration throws", async () => {
    let listened = false;
    let code = 0;
    let ended = 0;
    await finishMigrationProcess(
      async () => {
        throw new Error("Migration failed: 023_quote_snapshot_delete.sql");
      },
      {
        endPool: async () => {
          ended += 1;
        },
        exit: (next) => {
          code = next;
        },
        logError: () => {},
      },
    );
    if (code === 0) listened = true;
    assert.equal(code, 1);
    assert.equal(ended, 1);
    assert.equal(listened, false);
  });

  it("exits 1 and does not listen when migrate succeeds but pool shutdown throws", async () => {
    let listened = false;
    let code = 0;
    await finishMigrationProcess(async () => ({ applied: 24, skipped: 0 }), {
      endPool: async () => {
        throw new Error("pool end failed");
      },
      exit: (next) => {
        code = next;
      },
      logError: () => {},
    });
    if (code === 0) listened = true;
    assert.equal(code, 1);
    assert.equal(listened, false);
  });

  it("ends the pool and exits 0 after a successful migrate", async () => {
    const order: string[] = [];
    await finishMigrationProcess(
      async () => {
        order.push("migrate");
        return { applied: 0, skipped: 24 };
      },
      {
        endPool: async () => {
          order.push("end");
        },
        exit: (code) => {
          order.push(`exit:${code}`);
        },
        logError: () => {
          order.push("log");
        },
      },
    );
    assert.deepEqual(order, ["migrate", "end", "exit:0"]);
  });

  it("still exits 1 when ending the pool also fails after a migration error", async () => {
    let code = 0;
    await finishMigrationProcess(
      async () => {
        throw new Error("Migration failed: 023_quote_snapshot_delete.sql");
      },
      {
        endPool: async () => {
          throw new Error("Called end on pool more than once");
        },
        exit: (next) => {
          code = next;
        },
        logError: () => {},
      },
    );
    assert.equal(code, 1);
  });
});
