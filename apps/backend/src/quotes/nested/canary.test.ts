import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

describe("nested backend tests", () => {
  it("runs from a directory below src/<area>/", () => {
    const parts = fileURLToPath(import.meta.url).split(path.sep);
    const src = parts.lastIndexOf("src");
    assert.ok(src >= 0);
    assert.ok(parts.length - src >= 4);
  });
});
