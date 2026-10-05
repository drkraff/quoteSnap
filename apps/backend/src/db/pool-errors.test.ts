import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachIdleClientErrorHandler } from "./pool-errors.js";

describe("attachIdleClientErrorHandler", () => {
  it("logs an idle client error and does not throw or keep the password", () => {
    const pool = new EventEmitter();
    const lines: string[] = [];
    attachIdleClientErrorHandler(pool, (_level, fields) => {
      lines.push(JSON.stringify(fields));
    });
    const secret = "super-secret-db-password";
    assert.doesNotThrow(() => {
      pool.emit(
        "error",
        new Error(`connection terminated postgresql://app:${secret}@db.internal:5432/quotesnap`),
      );
    });
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /idle_client_error/);
    assert.equal(lines[0]!.includes(secret), false);
    assert.match(lines[0]!, /\[redacted\]@/);
  });
});
