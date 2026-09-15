import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  customerLinePayloadKeys,
  customerPayloadHasPrivateNoteKey,
  customerQuotePayloadKeys,
  toCustomerQuotePayload,
} from "./customer-payload.js";

const SECRET_JOB = "subcontractor check — do not tell the client";
const SECRET_LINE = "moisture from neighbor pipe";

describe("toCustomerQuotePayload", () => {
  it("allowlists customer fields and drops job + line private notes", () => {
    const payload = toCustomerQuotePayload({
      customerPhone: "+15555550100",
      totalCents: 2500,
      clientSentence: "Appliances and decorative lighting not included.",
      privateNote: SECRET_JOB,
      notes: "leftover drafts.notes must not leak either",
      lineItems: [
        {
          name: "Replace outlet",
          quantity: 3,
          unitPriceCents: 25000,
          unit: "each",
          privateNote: SECRET_LINE,
          notes: "also not customer-facing",
        },
      ],
    });

    assert.deepEqual(payload, {
      customerPhone: "+15555550100",
      totalCents: 2500,
      clientSentence: "Appliances and decorative lighting not included.",
      lineItems: [
        {
          name: "Replace outlet",
          quantity: 3,
          unitPriceCents: 25000,
          unit: "each",
        },
      ],
    });
    assert.deepEqual(Object.keys(payload).sort(), [...customerQuotePayloadKeys()].sort());
    assert.deepEqual(
      Object.keys(payload.lineItems[0]!).sort(),
      [...customerLinePayloadKeys()].sort(),
    );
    assert.equal(customerPayloadHasPrivateNoteKey(payload), false);

    const json = JSON.stringify(payload);
    assert.equal(json.includes(SECRET_JOB), false);
    assert.equal(json.includes(SECRET_LINE), false);
    assert.equal(json.includes("privateNote"), false);
    assert.equal(json.includes("private_note"), false);
    assert.equal(json.includes("notes"), false);
    assert.equal(json.includes("Appliances and decorative lighting not included."), true);
  });

  it("does not invent prices — unknown unitPriceCents stays null", () => {
    const payload = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 0,
      privateNote: SECRET_JOB,
      lineItems: [
        {
          name: "Laminate cabinets",
          quantity: 14,
          unitPriceCents: null,
          unit: "foot",
          privateNote: SECRET_LINE,
        },
      ],
    });
    assert.equal(payload.lineItems[0]!.unitPriceCents, null);
    assert.equal(payload.totalCents, 0);
    assert.equal(payload.clientSentence, null);
    assert.equal(JSON.stringify(payload).includes(SECRET_JOB), false);
  });

  it("omits the unselected alt from the customer payload (totals stay selected-only)", () => {
    const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const payload = toCustomerQuotePayload({
      customerPhone: "+15555550100",
      totalCents: 180000,
      lineItems: [
        {
          name: "Walk-in shower",
          quantity: 1,
          unitPriceCents: 180000,
          unit: "job",
          optionGroupId: groupId,
          optionRole: "base",
        },
        {
          name: "Keep the tub",
          quantity: 1,
          unitPriceCents: 45000,
          unit: "job",
          optionGroupId: groupId,
          optionRole: "alt",
        },
      ],
    });
    assert.equal(payload.lineItems.length, 1);
    assert.equal(payload.lineItems[0]!.name, "Walk-in shower");
    assert.equal(payload.totalCents, 180000);
    assert.equal(payload.clientSentence, null);
    assert.equal(JSON.stringify(payload).includes("Keep the tub"), false);
    assert.equal(JSON.stringify(payload).includes("optionRole"), false);
    assert.equal(JSON.stringify(payload).includes("optionGroupId"), false);
  });
});
