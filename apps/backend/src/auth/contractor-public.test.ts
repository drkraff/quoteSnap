import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contractorPublicFromRow } from "./contractor-public.js";

const ROW = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "ada@example.com",
  phone: null,
  display_name: "Ada",
  trade: "electrical",
  hourly_rate_cents: 8500,
  markup_percent: null,
};

describe("contractorPublicFromRow tax percent", () => {
  it("reads a fractional percent stored as numeric text", () => {
    const contractor = contractorPublicFromRow({
      ...ROW,
      currency_code: "USD",
      unit_system: "imperial",
      vat_percent: "8.250",
      country_code: "US",
    });
    assert.equal(contractor.vatPercent, 8.25);
    assert.equal(contractor.countryCode, "US");
    assert.equal(contractor.currencyCode, "USD");
  });

  it("uses 0 when a US row is missing its percent and keeps Israel at 18", () => {
    const missingUs = contractorPublicFromRow({
      ...ROW,
      currency_code: "USD",
      unit_system: "imperial",
      vat_percent: null,
      country_code: "US",
    });
    assert.equal(missingUs.vatPercent, 0);

    const israel = contractorPublicFromRow({
      ...ROW,
      currency_code: "ILS",
      unit_system: "metric",
      vat_percent: "18.000",
      country_code: "IL",
    });
    assert.equal(israel.vatPercent, 18);
    assert.equal(israel.countryCode, "IL");

    const unsetCountry = contractorPublicFromRow({
      ...ROW,
      currency_code: "ILS",
      unit_system: "metric",
      vat_percent: null,
      country_code: null,
    });
    assert.equal(unsetCountry.vatPercent, 18);
    assert.equal(unsetCountry.countryCode, null);
  });
});
