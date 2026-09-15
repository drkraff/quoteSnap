import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRIVATE_NOTE_FIELD_ERROR,
  PRIVATE_NOTE_MAX_LENGTH,
  normalizePrivateNote,
  parseOptionalPrivateNote,
} from "./private-note.js";

describe("normalizePrivateNote", () => {
  it("maps empty / whitespace / null to null (clear)", () => {
    assert.equal(normalizePrivateNote(null), null);
    assert.equal(normalizePrivateNote(undefined), null);
    assert.equal(normalizePrivateNote(""), null);
    assert.equal(normalizePrivateNote("   "), null);
    assert.equal(normalizePrivateNote("  moisture from neighbor  "), "moisture from neighbor");
  });
});

describe("parseOptionalPrivateNote", () => {
  it("trims and accepts a contractor note", () => {
    assert.deepEqual(parseOptionalPrivateNote("  moisture from neighbor  "), {
      ok: true,
      note: "moisture from neighbor",
    });
  });

  it("maps null and whitespace to null (clear)", () => {
    assert.deepEqual(parseOptionalPrivateNote(null), { ok: true, note: null });
    assert.deepEqual(parseOptionalPrivateNote(""), { ok: true, note: null });
    assert.deepEqual(parseOptionalPrivateNote("   "), { ok: true, note: null });
  });

  it("rejects non-strings and over-length values", () => {
    assert.deepEqual(parseOptionalPrivateNote(12), {
      ok: false,
      error: PRIVATE_NOTE_FIELD_ERROR,
    });
    assert.equal(
      parseOptionalPrivateNote("x".repeat(PRIVATE_NOTE_MAX_LENGTH + 1)).ok,
      false,
    );
    assert.equal(
      parseOptionalPrivateNote("x".repeat(PRIVATE_NOTE_MAX_LENGTH)).ok,
      true,
    );
  });
});
