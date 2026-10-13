import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMoneyCents } from "./currency.js";
import { quoteVatTotals, vatCents } from "./vat.js";

describe("currency and VAT", () => {
  it("formats ILS and USD from the same cents", () => {
    assert.equal(formatMoneyCents(11500), "₪115.00");
    assert.equal(formatMoneyCents(11500, "USD"), "$115.00");
  });

  it("computes Israel 18% half-up and a zero rate", () => {
    assert.equal(vatCents(11500, 18), 2070);
    assert.deepEqual(quoteVatTotals(11500, 18), {
      subtotalCents: 11500,
      vatPercent: 18,
      vatCents: 2070,
      totalCents: 13570,
    });
    assert.equal(quoteVatTotals(11500, 0)?.vatCents, 0);
    assert.equal(vatCents(3, 18), 1);
    assert.equal(vatCents(-1, 18), null);
    assert.equal(quoteVatTotals(2147483647, 18), null);
  });
});
