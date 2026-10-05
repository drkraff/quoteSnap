import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import {
  PASSWORD_TOO_LONG,
  PASSWORD_TOO_SHORT,
  passwordExceedsBcryptLimit,
  passwordPolicyError,
} from "./password.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** bcrypt only hashes the first 72 bytes. A longer password compares equal. */
const PREFIX = "a".repeat(72);
const TAIL = "EXTRA-SECRET";

describe("bcrypt 72-byte truncation", () => {
  it("treats a password and its 72-byte prefix as the same secret", async () => {
    const hash = await bcrypt.hash(PREFIX + TAIL, 4);
    assert.equal(await bcrypt.compare(PREFIX, hash), true);
    assert.equal(Buffer.byteLength(PREFIX), 72);
    assert.equal(passwordExceedsBcryptLimit(PREFIX), false);
    assert.equal(passwordExceedsBcryptLimit(PREFIX + TAIL), true);
  });
});

describe("passwordPolicyError", () => {
  it("keeps the short-password message and rejects more than 72 bytes", () => {
    assert.equal(passwordPolicyError("short"), PASSWORD_TOO_SHORT);
    assert.equal(passwordPolicyError(PREFIX), null);
    assert.equal(passwordPolicyError(PREFIX + "x"), PASSWORD_TOO_LONG);
  });
});

describe("auth routes enforce the bcrypt byte limit", () => {
  it("register uses passwordPolicyError and login rejects an overlong password before bcrypt.compare", () => {
    const source = readFileSync(path.join(here, "../routes/auth.ts"), "utf8");
    assert.match(source, /passwordPolicyError\(/);
    const login = source.slice(source.indexOf("POST /login"));
    const limitAt = login.indexOf("passwordExceedsBcryptLimit");
    const compareAt = login.indexOf("bcrypt.compare");
    assert.ok(limitAt >= 0);
    assert.ok(compareAt > limitAt);
  });
});
