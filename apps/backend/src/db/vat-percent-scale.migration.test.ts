import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

describe("030_vat_percent_scale.sql", () => {
  it("is numbered after the feedback migration and widens vat_percent without rewriting contractor rows", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
    const own = "030_vat_percent_scale.sql";
    assert.equal(files.includes(own), true);
    assert.equal(files.some((name) => name.startsWith("029_vat")), false);
    assert.equal(files.includes("028_contractor_country.sql"), true);

    const previous = files.filter((name) => name < own);
    const last = previous[previous.length - 1];
    assert.ok(
      last === "028_contractor_country.sql" || last === "029_feedback.sql",
      `expected 030 to follow 028 or 029_feedback, found ${last}`,
    );

    const sql = readFileSync(path.join(MIGRATIONS_DIR, own), "utf8");
    assert.match(sql, /ALTER COLUMN vat_percent TYPE numeric\(6, 3\)/);
    assert.match(sql, /USING vat_percent::numeric/);
    assert.match(sql, /CHECK \(vat_percent >= 0 AND vat_percent <= 100\)/);
    assert.doesNotMatch(sql, /\bUPDATE\b/i);
    assert.doesNotMatch(sql, /country_code/);
    assert.doesNotMatch(sql, /\bSET\b/i);
  });
});
