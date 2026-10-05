import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JWT_EXAMPLE_PLACEHOLDER, assertBootEnv, jwtAccessSecretError } from "./boot-env.js";

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

describe("assertBootEnv", () => {
  it("throws before listen when the access secret is the example placeholder", () => {
    assert.throws(
      () => assertBootEnv({ JWT_ACCESS_SECRET: JWT_EXAMPLE_PLACEHOLDER }),
      /placeholder/,
    );
    assert.doesNotThrow(() => assertBootEnv({ JWT_ACCESS_SECRET: LONG_SECRET }));
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
