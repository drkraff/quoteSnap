import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeAuthPhone } from "./auth-phone.js";

describe("normalizeAuthPhone", () => {
  it("passes through valid E.164", () => {
    assert.equal(normalizeAuthPhone("+15555550100"), "+15555550100");
    assert.equal(normalizeAuthPhone("+447911123456"), "+447911123456");
  });

  it("strips formatting from an E.164 value", () => {
    assert.equal(normalizeAuthPhone("+1 (555) 555-0100"), "+15555550100");
  });

  it("assumes US +1 for a 10-digit number without a country code", () => {
    assert.equal(normalizeAuthPhone("5555550100"), "+15555550100");
    assert.equal(normalizeAuthPhone("(555) 555-0100"), "+15555550100");
  });

  it("treats 11-digit numbers starting with 1 as US with country code", () => {
    assert.equal(normalizeAuthPhone("15555550100"), "+15555550100");
  });

  it("prefixes + when 11–15 digits already include a country code", () => {
    assert.equal(normalizeAuthPhone("447911123456"), "+447911123456");
  });

  it("rejects too-short, too-long, and country codes starting with 0", () => {
    assert.equal(normalizeAuthPhone(""), null);
    assert.equal(normalizeAuthPhone("5551234"), null);
    assert.equal(normalizeAuthPhone("+1555"), null);
    assert.equal(normalizeAuthPhone("1234567890123456"), null);
    assert.equal(normalizeAuthPhone("+05555550100"), null);
  });
});
