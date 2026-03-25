import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>(
    "SELECT name FROM _migrations ORDER BY name"
  );
  return new Set(result.rows.map((r) => r.name));
}

export async function runMigrations(): Promise<void> {
  console.info("Running migrations...");

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const filename of migrationFiles) {
    if (applied.has(filename)) {
      console.info(`  Skipping already-applied migration: ${filename}`);
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(filePath, "utf8");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO _migrations (name) VALUES ($1)",
        [filename]
      );
      await client.query("COMMIT");
      console.info(`  Applied migration: ${filename}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(
        `Migration failed: ${filename}\n${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      client.release();
    }
  }

  console.info("Migrations complete.");
}

// Main block: run directly if this is the entry point
const isMain =
  process.argv[1] != null &&
  (process.argv[1] === __filename ||
    process.argv[1].endsWith("migrate.ts") ||
    process.argv[1].endsWith("migrate.js"));

if (isMain) {
  runMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error("Migration error:", err);
      process.exit(1);
    });
}
