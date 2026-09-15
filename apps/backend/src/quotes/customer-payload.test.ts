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
          priceSource: "spoken",
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
          roomName: null,
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
    assert.equal(json.includes("priceSource"), false);
    assert.equal(json.includes("price_source"), false);
    assert.equal(json.includes("Appliances and decorative lighting not included."), true);
    assert.equal(customerQuotePayloadKeys().includes("privateNote"), false);
    assert.equal(customerLinePayloadKeys().includes("priceSource"), false);
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

  it("maps empty / whitespace clientSentence to null (does not invent job scope)", () => {
    const empty = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 25000,
      clientSentence: "   ",
      privateNote: SECRET_JOB,
      lineItems: [
        {
          name: "Replace outlet",
          quantity: 1,
          unitPriceCents: 25000,
          unit: "each",
          privateNote: SECRET_LINE,
        },
      ],
    });
    assert.equal(empty.clientSentence, null);
    const json = JSON.stringify(empty);
    assert.equal(json.includes(SECRET_JOB), false);
    assert.equal(json.includes(SECRET_LINE), false);
    assert.equal(json.includes("Appliances"), false);
    assert.equal(json.includes("not included"), false);

    const omitted = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 25000,
      lineItems: [
        { name: "Replace outlet", quantity: 1, unitPriceCents: 25000, unit: "each" },
      ],
    });
    assert.equal(omitted.clientSentence, null);
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

  it("includes a customer-facing room name and drops room private notes", () => {
    const kitchenId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const payload = toCustomerQuotePayload({
      customerPhone: "+15555550100",
      totalCents: 0,
      rooms: [
        {
          id: kitchenId,
          name: "Kitchen",
          privateNote: "don't tell the client about the neighbor pipe",
        },
      ],
      lineItems: [
        {
          name: "Cabinets",
          quantity: 14,
          unitPriceCents: null,
          unit: "foot",
          roomId: kitchenId,
        },
      ],
    });
    assert.equal(payload.lineItems[0]!.roomName, "Kitchen");
    assert.equal(payload.lineItems[0]!.unitPriceCents, null);
    const json = JSON.stringify(payload);
    assert.equal(json.includes("don't tell the client"), false);
    assert.equal(json.includes("privateNote"), false);
    assert.equal(json.includes(kitchenId), false);
    assert.equal(json.includes("Kitchen"), true);
  });

  it("drops photos, local URIs, and r2 keys from the customer payload", () => {
    const payload = toCustomerQuotePayload({
      customerPhone: "+15555550100",
      totalCents: 0,
      photos: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          clientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          localUri: "file:///docs/photos/secret.jpg",
          r2Key: "photos/contractor/secret.jpg",
          mime: "image/jpeg",
        },
      ],
      lineItems: [
        {
          name: "Cabinets",
          quantity: 14,
          unitPriceCents: null,
        },
      ],
    });
    const json = JSON.stringify(payload);
    assert.equal(json.includes("photo"), false);
    assert.equal(json.includes("localUri"), false);
    assert.equal(json.includes("r2Key"), false);
    assert.equal(json.includes("secret.jpg"), false);
    assert.equal(payload.lineItems[0]!.unitPriceCents, null);
  });
});
