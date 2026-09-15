import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const MIGRATION_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../db/migrations/020_rate_card_imported_source.sql",
);

describe("020_rate_card_imported_source.sql", () => {
  it("adds imported to the rate card source check without rewriting catalog or quotes", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    assert.match(sql, /DROP CONSTRAINT rate_card_entries_source_allowed/);
    assert.match(sql, /CHECK \(source IN \('typed', 'confirmed', 'imported'\)\)/);
    assert.doesNotMatch(sql, /ALTER TABLE catalog_items/);
    assert.doesNotMatch(sql, /ALTER TABLE quote_line_items/);
  });
});
