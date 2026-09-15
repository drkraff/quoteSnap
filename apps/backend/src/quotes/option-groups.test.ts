import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isOptionRole,
  lineAmountCents,
  lineContributesToTotal,
  listOptionGroups,
  OPTION_PAIR_ERROR,
  optionGroupMembers,
  parseOptionalOptionGroupId,
  parseOptionalOptionRole,
  parseOptionGroupFields,
  sanitizeOptionGroups,
  selectOptionForTotal,
  selectedOptionTotalCents,
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

describe("empty groups do not crash", () => {
  it("returns [] for members and groups when there are no lines", () => {
    assert.deepEqual(optionGroupMembers([], GROUP_ID), []);
    assert.deepEqual(optionGroupMembers(null, GROUP_ID), []);
    assert.deepEqual(listOptionGroups([]), []);
    assert.deepEqual(sanitizeOptionGroups([]), []);
    assert.deepEqual(sanitizeOptionGroups(null), []);
    assert.equal(selectedOptionTotalCents([]), 0);
    assert.equal(selectedOptionTotalCents(null), 0);
  });

  it("dissolves a leftover single-member group without inventing a price", () => {
    const orphan = [
      {
        name: "Keep the tub",
        quantity: 1,
        unitPriceCents: null,
        optionGroupId: GROUP_ID,
        optionRole: "alt" as const,
      },
    ];
    assert.equal(optionGroupMembers(orphan, GROUP_ID).length, 1);
    const dissolved = sanitizeOptionGroups(orphan);
    assert.equal(dissolved[0]!.optionGroupId, undefined);
    assert.equal(dissolved[0]!.optionRole, undefined);
    assert.equal(dissolved[0]!.unitPriceCents, null);
    const selected = selectOptionForTotal(orphan, 0);
    assert.equal(selected[0]!.unitPriceCents, null);
    assert.equal(selected[0]!.optionGroupId, undefined);
  });
});

describe("switch selection", () => {
  it("swaps roles and follows stored cents; empty/OOB is a no-op", () => {
    const items = [
      {
        name: "Walk-in shower",
        quantity: 1,
        unitPriceCents: 180000,
        optionGroupId: GROUP_ID,
        optionRole: "base" as const,
      },
      {
        name: "Keep the tub",
        quantity: 1,
        unitPriceCents: 45000,
        optionGroupId: GROUP_ID,
        optionRole: "alt" as const,
      },
      { name: "Vanity", quantity: 1, unitPriceCents: 80000 },
    ];
    assert.deepEqual(selectOptionForTotal([], 0), []);
    assert.equal(selectOptionForTotal(items, 99), items);
    assert.equal(selectOptionForTotal(items, 0), items);

    const switched = selectOptionForTotal(items, 1);
    assert.equal(switched[0]!.optionRole, "alt");
    assert.equal(switched[1]!.optionRole, "base");
    assert.equal(switched[0]!.unitPriceCents, 180000);
    assert.equal(switched[1]!.unitPriceCents, 45000);
    assert.equal(selectedOptionTotalCents(items), 260000);
    assert.equal(selectedOptionTotalCents(switched), 125000);
  });

  it("does not invent a price when the newly selected option is blank", () => {
    const items = [
      {
        name: "Walk-in shower",
        quantity: 1,
        unitPriceCents: 180000,
        optionGroupId: GROUP_ID,
        optionRole: "base" as const,
      },
      {
        name: "Keep the tub",
        quantity: 1,
        unitPriceCents: null,
        optionGroupId: GROUP_ID,
        optionRole: "alt" as const,
      },
    ];
    assert.equal(lineAmountCents({ quantity: 1, unitPriceCents: null }), 0);
    assert.equal(selectedOptionTotalCents(items), 180000);
    assert.equal(selectedOptionTotalCents(selectOptionForTotal(items, 1)), 0);
  });

  it("promotes the first member when a pair has no base", () => {
    const bothAlt = [
      {
        name: "Walk-in shower",
        quantity: 1,
        unitPriceCents: 180000,
        optionGroupId: GROUP_ID,
        optionRole: "alt" as const,
      },
      {
        name: "Keep the tub",
        quantity: 1,
        unitPriceCents: 45000,
        optionGroupId: GROUP_ID,
        optionRole: "alt" as const,
      },
    ];
    const sanitized = sanitizeOptionGroups(bothAlt);
    assert.equal(sanitized[0]!.optionRole, "base");
    assert.equal(sanitized[1]!.optionRole, "alt");
    assert.equal(sanitized[0]!.unitPriceCents, 180000);
  });
});
