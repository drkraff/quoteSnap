import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

describe("031_quote_lifecycle_guard.sql", () => {
  it("is the next migration after 030 and freezes sent quotes without rewriting rows", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
    const own = "031_quote_lifecycle_guard.sql";
    const index = files.indexOf(own);
    assert.ok(index > 0, `${own} is missing`);
    assert.equal(files[index - 1], "030_vat_percent_scale.sql");

    const sql = readFileSync(path.join(MIGRATIONS_DIR, own), "utf8");
    assert.match(sql, /CREATE TRIGGER quotes_status_transition/);
    assert.match(sql, /BEFORE UPDATE OF status ON quotes/);
    assert.match(sql, /CREATE TRIGGER quote_line_items_frozen/);
    assert.match(sql, /BEFORE INSERT OR UPDATE OR DELETE ON quote_line_items/);
    assert.match(sql, /frozen quote cannot return to draft or voice/);
    assert.match(sql, /quote line items are write-once after send/);
    assert.match(sql, /ERRCODE = '23514'/);
    assert.doesNotMatch(sql, /\bUPDATE\s+(quotes|quote_line_items)\b/i);
    assert.doesNotMatch(sql, /DEFERRABLE/);
  });
});
