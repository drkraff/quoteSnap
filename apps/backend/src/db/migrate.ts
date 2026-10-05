import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./connection.js";
import { errorSummary, log } from "../log/logger.js";
import { resolveMigrationsDir } from "./migrations-path.js";
import {
  finishMigrationProcess,
  runMigrationFiles,
  type MigrationDb,
  type MigrationIo,
} from "./migrate-runner.js";

const __filename = fileURLToPath(import.meta.url);

function productionIo(): MigrationIo {
  return {
    listSqlFiles: () => fs.readdirSync(resolveMigrationsDir()),
    readSql: (filename) =>
      fs.readFileSync(path.join(resolveMigrationsDir(), filename), "utf8"),
    info: (line) => {
      console.info(line);
    },
  };
}

export async function runMigrations(): Promise<{ applied: number; skipped: number }> {
  return runMigrationFiles(pool as unknown as MigrationDb, productionIo());
}

// Main block: run directly if this is the entry point
const isMain =
  process.argv[1] != null &&
  (process.argv[1] === __filename ||
    process.argv[1].endsWith("migrate.ts") ||
    process.argv[1].endsWith("migrate.js"));

if (isMain) {
  void finishMigrationProcess(() => runMigrations(), {
    endPool: () => pool.end(),
    exit: (code) => {
      process.exit(code);
    },
    logError: (err) => {
      log("error", { msg: "migration_failed", error: errorSummary(err) });
    },
  });
}
