import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMoneyCents, formatVatPercent, parseVatPercent, vatPercentForCountry } from "./currency.js";
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
    assert.equal(vatCents(19500, 8), 1560);
    assert.equal(vatCents(-1, 18), null);
    assert.equal(quoteVatTotals(2147483647, 18), null);
  });

  it("charges 8.25% of $1,125.00 as $92.81 and keeps a stored Israel 18", () => {
    assert.deepEqual(quoteVatTotals(112500, 8.25), {
      subtotalCents: 112500,
      vatPercent: 8.25,
      vatCents: 9281,
      totalCents: 121781,
    });
    assert.equal(vatCents(1000, 8.25), 83);
    assert.equal(parseVatPercent("8.250"), 8.25);
    assert.equal(parseVatPercent("18.000"), 18);
    assert.equal(formatVatPercent(8.25), "8.25");
    assert.equal(parseVatPercent(8.2555), null);
    assert.equal(parseVatPercent(101), null);
    assert.equal(vatPercentForCountry("US", null), 0);
    assert.equal(vatPercentForCountry("US", undefined), 0);
    assert.equal(vatPercentForCountry("US", 8.25), 8.25);
    assert.equal(vatPercentForCountry("US", 18), 18);
    assert.equal(vatPercentForCountry("IL", null), 18);
    assert.equal(vatPercentForCountry("IL", "18.000"), 18);
    assert.equal(vatPercentForCountry(null, undefined), 18);
  });
});
