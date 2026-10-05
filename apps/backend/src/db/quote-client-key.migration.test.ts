import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

describe("022_quote_client_key.sql", () => {
  it("is the next file after 021 and adds a nullable per-contractor unique key", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
    const previous = files.filter((name) => name < "022_quote_client_key.sql");
    assert.equal(previous[previous.length - 1], "021_quote_snapshots.sql");
    const sql = readFileSync(path.join(MIGRATIONS_DIR, "022_quote_client_key.sql"), "utf8");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS client_key/);
    assert.match(sql, /client_key (TEXT|VARCHAR\(\d+\))/);
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS/);
    assert.match(sql, /ON quotes \(contractor_id, client_key\)/);
    assert.match(sql, /WHERE client_key IS NOT NULL/);
    assert.doesNotMatch(sql, /total_cents/);
    assert.doesNotMatch(sql, /quote_line_items/);
    assert.doesNotMatch(sql, /UPDATE quotes/);
  });
});
