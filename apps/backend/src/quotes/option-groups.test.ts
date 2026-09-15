import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isOptionRole,
  lineContributesToTotal,
  OPTION_PAIR_ERROR,
  parseOptionalOptionGroupId,
  parseOptionalOptionRole,
  parseOptionGroupFields,
} from "./option-groups.js";

const GROUP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("isOptionRole / lineContributesToTotal", () => {
  it("accepts only base and alt", () => {
    assert.equal(isOptionRole("base"), true);
    assert.equal(isOptionRole("alt"), true);
    assert.equal(isOptionRole("selected"), false);
    assert.equal(isOptionRole("better"), false);
  });

  it("counts ungrouped and base toward the total, never alt", () => {
    assert.equal(lineContributesToTotal({}), true);
    assert.equal(lineContributesToTotal({ optionRole: null }), true);
    assert.equal(lineContributesToTotal({ optionRole: "base" }), true);
    assert.equal(lineContributesToTotal({ optionRole: "alt" }), false);
  });
});

describe("parseOptionalOptionGroupId", () => {
  it("treats omit as preserve and null/empty as clear", () => {
    assert.deepEqual(parseOptionalOptionGroupId(undefined), {
      ok: true,
      optionGroupId: undefined,
    });
    assert.deepEqual(parseOptionalOptionGroupId(null), {
      ok: true,
      optionGroupId: null,
    });
    assert.deepEqual(parseOptionalOptionGroupId(""), {
      ok: true,
      optionGroupId: null,
    });
  });

  it("accepts a UUID and rejects junk", () => {
    assert.deepEqual(parseOptionalOptionGroupId(GROUP_ID), {
      ok: true,
      optionGroupId: GROUP_ID,
    });
    assert.equal(parseOptionalOptionGroupId("not-a-uuid").ok, false);
    assert.equal(parseOptionalOptionGroupId(1).ok, false);
  });
});

describe("parseOptionalOptionRole", () => {
  it("treats omit as preserve and null/empty as clear", () => {
    assert.deepEqual(parseOptionalOptionRole(undefined), {
      ok: true,
      optionRole: undefined,
    });
    assert.deepEqual(parseOptionalOptionRole(null), { ok: true, optionRole: null });
    assert.deepEqual(parseOptionalOptionRole(""), { ok: true, optionRole: null });
  });

  it("accepts base|alt and rejects a third package tier", () => {
    assert.deepEqual(parseOptionalOptionRole("base"), { ok: true, optionRole: "base" });
    assert.deepEqual(parseOptionalOptionRole("alt"), { ok: true, optionRole: "alt" });
    assert.equal(parseOptionalOptionRole("best").ok, false);
  });
});

describe("parseOptionGroupFields", () => {
  it("preserves when neither key is sent", () => {
    const parsed = parseOptionGroupFields(undefined, undefined, false, false);
    assert.deepEqual(parsed, {
      ok: true,
      fields: { optionGroupId: undefined, optionRole: undefined },
    });
  });

  it("accepts a linked pair", () => {
    const parsed = parseOptionGroupFields(GROUP_ID, "alt", true, true);
    assert.deepEqual(parsed, {
      ok: true,
      fields: { optionGroupId: GROUP_ID, optionRole: "alt" },
    });
  });

  it("clears when both are null", () => {
    const parsed = parseOptionGroupFields(null, null, true, true);
    assert.deepEqual(parsed, {
      ok: true,
      fields: { optionGroupId: null, optionRole: null },
    });
  });

  it("rejects id without role and role without id", () => {
    assert.deepEqual(parseOptionGroupFields(GROUP_ID, undefined, true, false), {
      ok: false,
      error: OPTION_PAIR_ERROR,
    });
    assert.deepEqual(parseOptionGroupFields(undefined, "base", false, true), {
      ok: false,
      error: OPTION_PAIR_ERROR,
    });
    assert.deepEqual(parseOptionGroupFields(GROUP_ID, null, true, true), {
      ok: false,
      error: OPTION_PAIR_ERROR,
    });
  });
});
