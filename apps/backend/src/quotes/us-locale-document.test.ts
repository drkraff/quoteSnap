import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approvalPageModel, parseSnapshotPayload, renderApprovalView } from "./approval-page.js";
import { toCustomerQuotePayload } from "./customer-payload.js";

describe("US approval page", () => {
  it("labels sales tax and shows feet and hours without inventing a rate", () => {
    const payload = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 19500,
      currencyCode: "USD",
      vatPercent: 0,
      countryCode: "US",
      lineItems: [
        { name: "cable", quantity: 10, unitPriceCents: 450, unit: "foot" },
        { name: "labor", quantity: 2, unitPriceCents: 7500, unit: "hour" },
      ],
    });
    assert.equal(payload.countryCode, "US");
    assert.equal(payload.vatPercent, 0);
    const page = approvalPageModel({
      payload,
      contractorDisplayName: "Ada Electric",
      contractorTrade: "electrical",
      token: "tok",
    });
    const html = renderApprovalView({ kind: "open", page }).html;
    assert.match(html, /Sales tax 0%/);
    assert.match(html, /10 ft/);
    assert.match(html, /2 hours/);
    assert.match(html, /\$45\.00/);
    assert.match(html, /\$150\.00/);
    assert.match(html, /\$0\.00/);
    assert.match(html, /\$195\.00/);
    assert.equal(html.includes("VAT"), false);
    assert.equal(html.includes("₪"), false);
  });

  it("uses 0 when a US snapshot is missing its tax percent", () => {
    const payload = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 112500,
      currencyCode: "USD",
      countryCode: "US",
      lineItems: [
        { name: "panel", quantity: 1, unitPriceCents: 112500, unit: "each" },
      ],
    });
    assert.equal(payload.vatPercent, 0);
    assert.equal(payload.countryCode, "US");
  });

  it("shows 8.25% of $1,125.00 as $92.81 on the approval page", () => {
    const payload = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 112500,
      currencyCode: "USD",
      vatPercent: 8.25,
      countryCode: "US",
      lineItems: [
        { name: "panel", quantity: 1, unitPriceCents: 112500, unit: "each" },
      ],
    });
    assert.equal(payload.vatPercent, 8.25);
    const stored = parseSnapshotPayload(payload);
    assert.equal(stored?.vatPercent, 8.25);
    const page = approvalPageModel({
      payload,
      contractorDisplayName: "Ada Electric",
      contractorTrade: "electrical",
      token: "tok",
    });
    const html = renderApprovalView({ kind: "open", page }).html;
    assert.match(html, /Sales tax 8\.25%/);
    assert.match(html, /\$92\.81/);
    assert.match(html, /\$1,?217\.81|\$1217\.81/);
    assert.equal(html.includes("VAT"), false);
  });

  it("keeps VAT on a snapshot that has no country", () => {
    const payload = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 11500,
      currencyCode: "ILS",
      vatPercent: 18,
      lineItems: [
        { name: "cable", quantity: 2, unitPriceCents: 3000, unit: "meter" },
      ],
    });
    assert.equal(payload.countryCode, null);
    const page = approvalPageModel({
      payload,
      contractorDisplayName: "Noa",
      contractorTrade: "electrical",
      token: "tok",
    });
    const html = renderApprovalView({ kind: "open", page }).html;
    assert.match(html, /VAT 18%/);
    assert.match(html, /2 m/);
    assert.equal(html.includes("Sales tax"), false);
  });
});
