import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AILineItem } from "../types/voice.js";
import { attachOneVoicePrice } from "../workers/voice-price-attach.js";
import {
  spokenHoursFromTranscript,
  supplementSpokenExtract,
} from "./spoken-extract.js";

function socketLine(overrides: Partial<AILineItem> = {}): AILineItem {
  return {
    name: "Double socket",
    quantity: 2,
    unit: "each",
    confidence: 0.8,
    room: "living room",
    ...overrides,
  };
}

describe("supplementSpokenExtract", () => {
  it("uses the spoken each-price and keeps the lump sum", () => {
    const transcript =
      "two double sockets living room, 3h labour, sockets 80 shekels each, plus 150 cable/materials";
    const { items, spokenHours } = supplementSpokenExtract(
      transcript,
      [socketLine(), { name: "Labor", quantity: 3, unit: "hour", confidence: 0.8 }],
      3,
    );

    assert.equal(spokenHours, 3);
    assert.equal(items[0]?.spokenUnitPriceCents, 8000);
    const lump = items.find((item) => /cable/i.test(item.name ?? ""));
    assert.ok(lump);
    assert.equal(lump?.quantity, 1);
    assert.equal(lump?.unit, "job");
    assert.equal(lump?.spokenUnitPriceCents, 15000);
    assert.equal(lump?.catalogItemId, null);
    assert.equal(items.filter((item) => item.name === "Double socket").length, 1);

    const priced = attachOneVoicePrice(
      {
        catalogItemId: null,
        name: "Double socket",
        quantity: 2,
        unit: "each",
        spokenUnitPriceCents: items[0]?.spokenUnitPriceCents ?? null,
        spokenMaterialCostCents: null,
        catalogUnitPriceCents: 10000,
        confidence: 0.9,
        roomName: "living room",
      },
      10000,
      1500,
      null,
    );
    assert.deepEqual(priced, { unitPriceCents: 8000, priceSource: "spoken" });
  });

  it("lands a leading dollar amount on the line and beats the rate card", () => {
    const perFoot = supplementSpokenExtract(
      "14 feet of 12/2 at $4.50 a foot",
      [{ name: "12/2", quantity: 14, unit: "sqft", confidence: 0.8 }],
      null,
    );
    assert.equal(perFoot.items[0]?.spokenUnitPriceCents, 450);

    const outlet = supplementSpokenExtract(
      "$80 for the outlet",
      [{ name: "Outlet", quantity: 1, unit: "each", confidence: 0.8 }],
      null,
    );
    assert.equal(outlet.items[0]?.spokenUnitPriceCents, 8000);

    const dollars = supplementSpokenExtract(
      "80 dollars for the outlet",
      [{ name: "Outlet", quantity: 1, unit: "each", confidence: 0.8 }],
      null,
    );
    assert.equal(dollars.items[0]?.spokenUnitPriceCents, 8000);

    const both = supplementSpokenExtract(
      "14 feet of 12/2 at $4.50 a foot and $80 for the outlet",
      [
        { name: "12/2", quantity: 14, unit: "foot", confidence: 0.8 },
        { name: "Outlet", quantity: 1, unit: "each", confidence: 0.8 },
      ],
      null,
    );
    assert.equal(both.items[0]?.spokenUnitPriceCents, 450);
    assert.equal(both.items[1]?.spokenUnitPriceCents, 8000);

    const named = supplementSpokenExtract(
      "14 feet of cable at $4.50 a foot and $80 for the outlet",
      [
        { name: "Cable", quantity: 14, unit: "sqft", confidence: 0.8 },
        { name: "Outlet", quantity: 1, unit: "each", confidence: 0.8 },
      ],
      null,
    );
    assert.equal(named.items[0]?.spokenUnitPriceCents, 450);
    assert.equal(named.items[1]?.spokenUnitPriceCents, 8000);

    const priced = attachOneVoicePrice(
      {
        catalogItemId: null,
        name: "12/2",
        quantity: 14,
        unit: "foot",
        spokenUnitPriceCents: perFoot.items[0]?.spokenUnitPriceCents ?? null,
        spokenMaterialCostCents: null,
        catalogUnitPriceCents: null,
        confidence: 0.8,
        roomName: null,
      },
      900,
      null,
      null,
    );
    assert.deepEqual(priced, { unitPriceCents: 450, priceSource: "spoken" });
  });

  it("keeps half an hour instead of rounding it up to 1", () => {
    const transcript = "replace one light switch, 40 shekels, half an hour";
    assert.equal(spokenHoursFromTranscript(transcript), 0.5);
    const { items, spokenHours } = supplementSpokenExtract(
      transcript,
      [
        { name: "Light switch", quantity: 1, unit: "each", confidence: 0.8 },
        { name: "Labor", quantity: 1, unit: "hour", confidence: 0.7 },
      ],
      1,
    );
    assert.equal(spokenHours, 0.5);
    assert.equal(items[1]?.quantity, 0.5);
    assert.ok((items[1]?.confidence ?? 0) >= 0.9);
    assert.equal(items[0]?.spokenUnitPriceCents, 4000);
  });

  it("parses one and a half and two and a half hours, and keeps half an hour at 0.5", () => {
    assert.equal(spokenHoursFromTranscript("half an hour"), 0.5);
    assert.equal(spokenHoursFromTranscript("one and a half hours"), 1.5);
    assert.equal(spokenHoursFromTranscript("two and a half hours of labor"), 2.5);
    assert.equal(spokenHoursFromTranscript("an hour and a half"), 1.5);
    assert.equal(spokenHoursFromTranscript("3 hours and a half"), 3.5);
    assert.equal(spokenHoursFromTranscript("call it 3 hours"), 3);

    const one = supplementSpokenExtract(
      "one and a half hours",
      [{ name: "Labor", quantity: 1, unit: "hour", confidence: 0.7 }],
      1,
    );
    assert.equal(one.spokenHours, 1.5);
    assert.equal(one.items[0]?.quantity, 1.5);

    const two = supplementSpokenExtract(
      "two and a half hours of labor",
      [{ name: "Labor", quantity: 2.5, unit: "hour", confidence: 0.8 }],
      2.5,
    );
    assert.equal(two.spokenHours, 2.5);
    assert.equal(two.items[0]?.quantity, 2.5);

    const half = supplementSpokenExtract(
      "half an hour",
      [{ name: "Labor", quantity: 1, unit: "hour", confidence: 0.7 }],
      1,
    );
    assert.equal(half.spokenHours, 0.5);
    assert.equal(half.items[0]?.quantity, 0.5);
  });

  it("does not invent a price or a line the contractor did not say", () => {
    const { items, spokenHours } = supplementSpokenExtract(
      "two double sockets in the living room",
      [socketLine()],
      null,
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]?.spokenUnitPriceCents, undefined);
    assert.equal(spokenHours, null);
  });

  it("drops a raw transcript fragment from the client sentence path via hours only", () => {
    assert.equal(
      spokenHoursFromTranscript("Sockets are 80 shekels each, plus 150 for cable and materials."),
      null,
    );
    const { items } = supplementSpokenExtract(
      "Sockets are 80 shekels each, plus 150 for cable and materials.",
      [socketLine()],
      null,
    );
    assert.equal(items[0]?.spokenUnitPriceCents, 8000);
    const lump = items.find((item) => /cable/i.test(item.name ?? ""));
    assert.equal(lump?.spokenUnitPriceCents, 15000);
    assert.equal(lump?.name, "cable and materials");
  });
});
