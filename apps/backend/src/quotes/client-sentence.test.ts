import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_SENTENCE_FIELD_ERROR,
  CLIENT_SENTENCE_MAX_LENGTH,
  parseOptionalClientSentence,
} from "./client-sentence.js";

describe("parseOptionalClientSentence", () => {
  it("trims and accepts a customer-facing sentence", () => {
    assert.deepEqual(
      parseOptionalClientSentence("  Appliances and decorative lighting not included.  "),
      {
        ok: true,
        sentence: "Appliances and decorative lighting not included.",
      },
    );
  });

  it("maps null and whitespace to null (clear)", () => {
    assert.deepEqual(parseOptionalClientSentence(null), { ok: true, sentence: null });
    assert.deepEqual(parseOptionalClientSentence(""), { ok: true, sentence: null });
    assert.deepEqual(parseOptionalClientSentence("   "), { ok: true, sentence: null });
  });

  it("rejects non-strings and over-length values", () => {
    assert.deepEqual(parseOptionalClientSentence(12), {
      ok: false,
      error: CLIENT_SENTENCE_FIELD_ERROR,
    });
    assert.equal(
      parseOptionalClientSentence("x".repeat(CLIENT_SENTENCE_MAX_LENGTH + 1)).ok,
      false,
    );
    assert.equal(
      parseOptionalClientSentence("x".repeat(CLIENT_SENTENCE_MAX_LENGTH)).ok,
      true,
    );
  });
});
