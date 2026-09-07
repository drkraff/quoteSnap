import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveWhisperLanguage } from "./whisper-language.js";

describe("resolveWhisperLanguage", () => {
  it("defaults to English when the env var is unset", () => {
    assert.equal(resolveWhisperLanguage(undefined), "en");
  });

  it("keeps an explicit override such as Hebrew", () => {
    assert.equal(resolveWhisperLanguage("he"), "he");
  });

  it("omits the language pin when the env var is empty (auto-detect)", () => {
    assert.equal(resolveWhisperLanguage(""), undefined);
  });
});
