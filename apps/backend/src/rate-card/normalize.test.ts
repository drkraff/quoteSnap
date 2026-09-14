import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayRateCardName, normalizeRateCardName, rateCardTradeKey } from "./normalize.js";

describe("normalizeRateCardName", () => {
  it("trims, collapses whitespace, and lowercases for exact English keys", () => {
    assert.equal(normalizeRateCardName("  Copper   Pipe  "), "copper pipe");
    assert.equal(normalizeRateCardName("COPPER PIPE"), "copper pipe");
    assert.equal(normalizeRateCardName("copper pipe"), "copper pipe");
  });

  it("does not stem, strip punctuation, or fold lookalikes", () => {
    assert.equal(normalizeRateCardName("Pipes"), "pipes");
    assert.equal(normalizeRateCardName("pipe-repair"), "pipe-repair");
    assert.equal(normalizeRateCardName("café"), "café");
  });

  it("treats blank names as empty after normalize", () => {
    assert.equal(normalizeRateCardName("   "), "");
    assert.equal(normalizeRateCardName(""), "");
  });
});

describe("displayRateCardName", () => {
  it("keeps contractor casing after trim/collapse", () => {
    assert.equal(displayRateCardName("  Copper   Pipe  "), "Copper Pipe");
  });
});

describe("rateCardTradeKey", () => {
  it("uses empty string for omitted/blank trade so NULL trade matches", () => {
    assert.equal(rateCardTradeKey(null), "");
    assert.equal(rateCardTradeKey(undefined), "");
    assert.equal(rateCardTradeKey("   "), "");
    assert.equal(rateCardTradeKey("plumbing"), "plumbing");
  });
});
