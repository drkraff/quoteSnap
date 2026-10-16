import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

describe("029_feedback.sql", () => {
  it("follows 028 and adds a feedback table with a 1MB screenshot cap", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
    const index = files.indexOf("029_feedback.sql");
    assert.equal(files[index - 1], "028_contractor_country.sql");

    const sql = readFileSync(path.join(MIGRATIONS_DIR, "029_feedback.sql"), "utf8");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS feedback/);
    assert.match(sql, /contractor_id UUID NOT NULL REFERENCES contractors\(id\)/);
    assert.match(sql, /message TEXT NOT NULL/);
    assert.match(sql, /rating SMALLINT/);
    assert.match(sql, /screen TEXT/);
    assert.match(sql, /quote_id UUID/);
    assert.match(sql, /app_version TEXT/);
    assert.match(sql, /platform TEXT/);
    assert.match(sql, /screenshot BYTEA/);
    assert.match(sql, /created_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
    assert.match(sql, /rating IS NULL OR \(rating >= 1 AND rating <= 5\)/);
    assert.match(sql, /octet_length\(screenshot\) <= 1048576/);
    assert.match(sql, /Not a foreign key/);
    assert.doesNotMatch(sql, /REFERENCES quotes/);
    assert.doesNotMatch(sql, /\bUPDATE\b/i);
    assert.doesNotMatch(sql, /DROP TABLE/i);
  });
});
