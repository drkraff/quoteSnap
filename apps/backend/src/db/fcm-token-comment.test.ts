import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations/008_fcm_token_comment.sql",
);

describe("008_fcm_token_comment.sql", () => {
  it("documents fcm_token without dropping the column (A-19)", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    assert.match(sql, /COMMENT ON COLUMN contractors\.fcm_token IS/);
    assert.match(sql, /FAIL-08/);
    assert.match(sql, /SMS-08/);
    assert.doesNotMatch(sql, /DROP COLUMN/i);
    assert.doesNotMatch(sql, /DROP TABLE/i);
  });
});
