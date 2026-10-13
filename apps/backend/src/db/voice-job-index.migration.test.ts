import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

describe("027_quotes_voice_job_index.sql", () => {
  it("follows 026 and indexes the voice status poll", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
    const previous = files.filter((name) => name < "027_quotes_voice_job_index.sql");
    assert.equal(previous[previous.length - 1], "026_locale_and_customer_document.sql");
    const sql = readFileSync(path.join(MIGRATIONS_DIR, "027_quotes_voice_job_index.sql"), "utf8");
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_quotes_voice_job_id/);
    assert.match(sql, /ON quotes \(voice_job_id, contractor_id\)/);
    assert.match(sql, /WHERE voice_job_id IS NOT NULL/);
    assert.doesNotMatch(sql, /unit_price_cents/);
    assert.doesNotMatch(sql, /UPDATE quotes/);
  });
});
