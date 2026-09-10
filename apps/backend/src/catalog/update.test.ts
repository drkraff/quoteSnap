import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { catalogUpdateAssignments } from "./update.js";

describe("catalogUpdateAssignments", () => {
  it("does not SET trade_category on name/unit/price edits (A-15)", () => {
    const plan = catalogUpdateAssignments({
      name: "Copper pipe",
      unit: "foot",
      unitPriceCents: 1800,
    });
    assert.deepEqual(plan.setClauses, [
      "name = $1",
      "unit = $2",
      "unit_price_cents = $3",
    ]);
    assert.deepEqual(plan.params, ["Copper pipe", "foot", 1800]);
    assert.equal(
      plan.setClauses.some((clause) => clause.includes("trade_category")),
      false
    );
  });

  it("writes trade_category only when the body includes the key", () => {
    const plan = catalogUpdateAssignments({ tradeCategory: "electrical" });
    assert.deepEqual(plan.setClauses, ["trade_category = $1"]);
    assert.deepEqual(plan.params, ["electrical"]);
  });

  it("normalizes a blank tradeCategory to NULL when explicitly sent", () => {
    const plan = catalogUpdateAssignments({ tradeCategory: "  " });
    assert.deepEqual(plan.setClauses, ["trade_category = $1"]);
    assert.deepEqual(plan.params, [null]);
  });
});
