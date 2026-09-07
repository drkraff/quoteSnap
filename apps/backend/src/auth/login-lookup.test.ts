import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveLoginIdentifier } from "./login-lookup.js";

describe("resolveLoginIdentifier", () => {
  it("looks up by email only when email is provided", () => {
    assert.deepEqual(resolveLoginIdentifier("a@example.com", undefined), {
      field: "email",
      value: "a@example.com",
    });
  });

  it("looks up by phone only when email is absent", () => {
    assert.deepEqual(resolveLoginIdentifier(undefined, "+15555550100"), {
      field: "phone",
      value: "+15555550100",
    });
  });

  it("does not mix identifiers when email and phone are both provided", () => {
    assert.deepEqual(
      resolveLoginIdentifier("attacker@example.com", "+15555550999"),
      { field: "email", value: "attacker@example.com" }
    );
  });

  it("trims whitespace and treats blank email as missing", () => {
    assert.deepEqual(resolveLoginIdentifier("   ", "+15555550100"), {
      field: "phone",
      value: "+15555550100",
    });
  });

  it("returns null when neither identifier is usable", () => {
    assert.equal(resolveLoginIdentifier(null, "  "), null);
    assert.equal(resolveLoginIdentifier(undefined, undefined), null);
  });
});
