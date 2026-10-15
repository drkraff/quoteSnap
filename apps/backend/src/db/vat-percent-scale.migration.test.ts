import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

describe("029_vat_percent_scale.sql", () => {
  it("follows 028 and widens vat_percent without rewriting contractor rows", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
    const previous = files.filter((name) => name < "029_vat_percent_scale.sql");
    assert.equal(previous[previous.length - 1], "028_contractor_country.sql");

    const sql = readFileSync(path.join(MIGRATIONS_DIR, "029_vat_percent_scale.sql"), "utf8");
    assert.match(sql, /ALTER COLUMN vat_percent TYPE numeric\(6, 3\)/);
    assert.match(sql, /USING vat_percent::numeric/);
    assert.match(sql, /CHECK \(vat_percent >= 0 AND vat_percent <= 100\)/);
    assert.doesNotMatch(sql, /\bUPDATE\b/i);
    assert.doesNotMatch(sql, /country_code/);
    assert.doesNotMatch(sql, /\bSET\b/i);
  });
});
