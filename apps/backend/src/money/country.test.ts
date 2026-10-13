import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COUNTRY_PRESETS,
  ONBOARDING_COUNTRIES,
  taxLabelForCountry,
  voiceUnitRule,
} from "./currency.js";

describe("country presets", () => {
  it("lists the United States first and keeps Israel on the previous defaults", () => {
    assert.equal(ONBOARDING_COUNTRIES[0], "US");
    assert.deepEqual(COUNTRY_PRESETS.US, {
      countryCode: "US",
      currencyCode: "USD",
      unitSystem: "imperial",
      vatPercent: 0,
      taxLabel: "Sales tax",
    });
    assert.equal(COUNTRY_PRESETS.IL.currencyCode, "ILS");
    assert.equal(COUNTRY_PRESETS.IL.unitSystem, "metric");
    assert.equal(COUNTRY_PRESETS.IL.vatPercent, 18);
    assert.equal(taxLabelForCountry("US"), "Sales tax");
    assert.equal(taxLabelForCountry(null), "VAT");
    assert.equal(taxLabelForCountry("IL"), "VAT");
  });

  it("asks for feet on cable for imperial contractors and meters otherwise", () => {
    assert.match(voiceUnitRule("imperial"), /foot for cable/);
    assert.match(voiceUnitRule("imperial"), /Labor is hour/);
    assert.match(voiceUnitRule("metric"), /meter or sqm/);
    assert.match(voiceUnitRule(null), /meter or sqm/);
    assert.equal(voiceUnitRule(null).includes("foot for cable"), false);
  });
});
