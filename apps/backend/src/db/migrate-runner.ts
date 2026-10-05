import { errorSummary, log } from "../log/logger.js";
import { redactString } from "../log/redact.js";

/** Session advisory lock so two Railway replicas cannot apply the same file. */
const MIGRATE_LOCK_CLASS = 87;
const MIGRATE_LOCK_ID = 9009;

export type MigrationClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  release: (err?: Error) => void;
  on?: (event: "error", listener: (err: Error) => void) => void;
  removeListener?: (event: "error", listener: (err: Error) => void) => void;
};

export type MigrationDb = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ name: string }> }>;
  connect: () => Promise<MigrationClient>;
};

export type MigrationIo = {
  listSqlFiles: () => string[];
  readSql: (filename: string) => string;
  info: (line: string) => void;
};

export type MigrationCounts = { applied: number; skipped: number };

export type MigrationProcessDeps = {
  endPool: () => Promise<void>;
  exit: (code: number) => void;
  logError: (err: unknown) => void;
};

function bindClientError(client: MigrationClient): () => void {
  if (!client.on) return () => {};
  const onError = (err: Error) => {
    const summary = errorSummary(err);
    log("error", {
      msg: "migration_client_error",
      error: { name: summary.name, message: redactString(summary.message) },
    });
  };
  client.on("error", onError);
  return () => {
    client.removeListener?.("error", onError);
  };
}

export async function runMigrationFiles(
  db: MigrationDb,
  io: MigrationIo,
): Promise<MigrationCounts> {
  io.info("Running migrations...");

  const lockClient = await db.connect();
  const unbindLock = bindClientError(lockClient);
  let applied = 0;
  let skipped = 0;
  try {
    await lockClient.query("SELECT pg_advisory_lock($1, $2)", [
      MIGRATE_LOCK_CLASS,
      MIGRATE_LOCK_ID,
    ]);

    await db.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const existing = await db.query("SELECT name FROM _migrations ORDER BY name");
    const appliedNames = new Set(existing.rows.map((row) => row.name));
    const files = [...io.listSqlFiles()].filter((name) => name.endsWith(".sql")).sort();

    for (const filename of files) {
      if (appliedNames.has(filename)) {
        skipped += 1;
        io.info(`  Skipping already-applied migration: ${filename}`);
        continue;
      }

      const sql = io.readSql(filename);
      const client = await db.connect();
      const unbind = bindClientError(client);
      let failed: Error | undefined;
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [filename]);
        await client.query("COMMIT");
        applied += 1;
        io.info(`  Applied migration: ${filename}`);
      } catch (err) {
        failed = err instanceof Error ? err : new Error(String(err));
        try {
          await client.query("ROLLBACK");
        } catch {
          // The connection is already dead. Release below destroys the client.
        }
        throw new Error(`Migration failed: ${filename}\n${failed.message}`);
      } finally {
        unbind();
        client.release(failed);
      }
    }

    log("info", { msg: "migrations_complete", applied, skipped });
    io.info("Migrations complete.");
    return { applied, skipped };
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock($1, $2)", [
        MIGRATE_LOCK_CLASS,
        MIGRATE_LOCK_ID,
      ]);
    } finally {
      unbindLock();
      lockClient.release();
    }
  }
}

/**
 * Migrate, close the pool, then exit. A failure exits non-zero and does not
 * continue, so the shell `&&` that starts the API never listens.
 */
export async function finishMigrationProcess(
  run: () => Promise<unknown>,
  deps: MigrationProcessDeps,
): Promise<void> {
  let failed = false;
  try {
    await run();
  } catch (err) {
    failed = true;
    deps.logError(err);
  }
  try {
    await deps.endPool();
  } catch (err) {
    failed = true;
    const message = err instanceof Error ? err.message : String(err);
    deps.logError(new Error(`pool shutdown after migrate failed: ${message}`));
  }
  deps.exit(failed ? 1 : 0);
}
