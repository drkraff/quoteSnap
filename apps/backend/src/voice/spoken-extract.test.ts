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
