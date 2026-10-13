import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

describe("028_contractor_country.sql", () => {
  it("follows 027 and only adds a nullable country code", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
    const previous = files.filter((name) => name < "028_contractor_country.sql");
    assert.equal(previous[previous.length - 1], "027_quotes_voice_job_index.sql");
    assert.equal(previous.includes("026_locale_and_customer_document.sql"), true);

    const sql = readFileSync(path.join(MIGRATIONS_DIR, "028_contractor_country.sql"), "utf8");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS country_code VARCHAR\(2\)/);
    assert.match(sql, /country_code IS NULL OR country_code IN \('US', 'IL'\)/);
    assert.doesNotMatch(sql, /\bUPDATE\b/i);
    assert.doesNotMatch(sql, /\bDEFAULT\b/i);
    assert.doesNotMatch(sql, /NOT NULL/i);
    assert.doesNotMatch(sql, /currency_code/);
    assert.doesNotMatch(sql, /unit_system/);
    assert.doesNotMatch(sql, /vat_percent/);
  });
});
