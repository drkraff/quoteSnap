import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

describe("024_catalog_client_key.sql", () => {
  it("follows 023 and adds a nullable per-contractor unique key", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
    const previous = files.filter((name) => name < "024_catalog_client_key.sql");
    assert.equal(previous[previous.length - 1], "023_quote_snapshot_delete.sql");
    const sql = readFileSync(path.join(MIGRATIONS_DIR, "024_catalog_client_key.sql"), "utf8");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS client_key/);
    assert.match(sql, /client_key (TEXT|VARCHAR\(\d+\))/);
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS/);
    assert.match(sql, /ON catalog_items \(contractor_id, client_key\)/);
    assert.match(sql, /WHERE client_key IS NOT NULL/);
    assert.doesNotMatch(sql, /unit_price_cents/);
    assert.doesNotMatch(sql, /UPDATE catalog_items/);
  });
});
