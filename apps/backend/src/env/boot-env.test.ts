import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JWT_EXAMPLE_PLACEHOLDER,
  assertBootEnv,
  databaseUrlError,
  jwtAccessSecretError,
} from "./boot-env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const LONG_SECRET = "a".repeat(32);

describe("jwtAccessSecretError", () => {
  it("rejects a missing, blank, short, or example JWT secret", () => {
    assert.match(jwtAccessSecretError(undefined) ?? "", /JWT_ACCESS_SECRET/);
    assert.match(jwtAccessSecretError("   ") ?? "", /JWT_ACCESS_SECRET/);
    assert.match(jwtAccessSecretError("too-short") ?? "", /32/);
    assert.match(jwtAccessSecretError(JWT_EXAMPLE_PLACEHOLDER) ?? "", /placeholder/);
    assert.equal(jwtAccessSecretError(LONG_SECRET), null);
  });
});

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:5432/quotesnap";
const DB_SECRET = "super-secret-db-password";

describe("databaseUrlError", () => {
  it("rejects a missing, blank, or non-postgres URL without echoing the value", () => {
    assert.match(databaseUrlError(undefined) ?? "", /DATABASE_URL environment variable is required/);
    assert.match(databaseUrlError("   ") ?? "", /DATABASE_URL environment variable is required/);
    assert.equal(databaseUrlError(DB_URL), null);
    assert.equal(
      databaseUrlError("postgresql://user:p%40ss@db.internal:5432/quotesnap"),
      null,
    );
    assert.equal(databaseUrlError("host=db.internal dbname=quotesnap"), null);
    assert.equal(
      databaseUrlError("postgresql:///quotesnap?host=/var/run/postgresql"),
      null,
    );
    assert.equal(
      databaseUrlError("postgresql://user:secret@/quotesnap?host=127.0.0.1"),
      null,
    );

    const invalid = [
      "not-a-url",
      "postgresql://",
      `http://app:${DB_SECRET}@db.internal:5432/quotesnap`,
      `postgres://app:${DB_SECRET}@`,
    ];
    for (const value of invalid) {
      const message = databaseUrlError(value);
      assert.match(message ?? "", /DATABASE_URL is invalid/);
      assert.equal(message?.includes(DB_SECRET), false);
      assert.equal(message?.includes("db.internal"), false);
    }
  });
});

describe("assertBootEnv", () => {
  it("throws before listen when the access secret is the example placeholder", () => {
    assert.throws(
      () => assertBootEnv({ JWT_ACCESS_SECRET: JWT_EXAMPLE_PLACEHOLDER, DATABASE_URL: DB_URL }),
      /placeholder/,
    );
    assert.doesNotThrow(() =>
      assertBootEnv({ JWT_ACCESS_SECRET: LONG_SECRET, DATABASE_URL: DB_URL }),
    );
  });

  it("throws when DATABASE_URL is missing or invalid and does not include the secret", () => {
    assert.throws(
      () => assertBootEnv({ JWT_ACCESS_SECRET: LONG_SECRET }),
      /DATABASE_URL environment variable is required/,
    );
    assert.throws(
      () =>
        assertBootEnv({
          JWT_ACCESS_SECRET: LONG_SECRET,
          DATABASE_URL: `http://app:${DB_SECRET}@db.internal/quotesnap`,
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /DATABASE_URL is invalid/);
        assert.equal(err.message.includes(DB_SECRET), false);
        assert.equal(err.message.includes("db.internal"), false);
        return true;
      },
    );
  });
});

describe("startServer checks the JWT secret before initBoss", () => {
  it("calls assertBootEnv ahead of initBoss", () => {
    const source = readFileSync(path.join(here, "../index.ts"), "utf8");
    const start = source.slice(source.indexOf("async function startServer"));
    const bootAt = start.indexOf("assertBootEnv(");
    const bossAt = start.indexOf("initBoss(");
    assert.ok(bootAt >= 0);
    assert.ok(bossAt > bootAt);
  });
});
