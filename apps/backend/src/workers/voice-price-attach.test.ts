import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  attachOneVoicePrice,
  attachVoiceLinePrices,
  computeMaterialSellCents,
  ensureLaborLineFromSpokenHours,
  isLaborVoiceLine,
  lookupExactRateCardCents,
  parseSignupMarkupPercent,
  parseSpokenHours,
  snapshotUnitPriceCents,
  voiceLineNeedsRateCard,
} from "./voice-price-attach.js";
import type { BuiltVoiceLine } from "./voice-validation.js";
import {
  SELECT_RATE_CARD_BY_KEY_SQL,
  type RateCardQueryFn,
  type RateCardRow,
} from "../rate-card/upsert.js";

const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function line(overrides: Partial<BuiltVoiceLine> = {}): BuiltVoiceLine {
  return {
    catalogItemId: null,
    name: "Laminate cabinets",
    quantity: 14,
    unit: "foot",
    spokenUnitPriceCents: null,
    spokenMaterialCostCents: null,
    catalogUnitPriceCents: null,
    confidence: 0.8,
    roomName: null,
    ...overrides,
  };
}

describe("attachOneVoicePrice", () => {
  it("keeps a spoken unit price and ignores catalog and rate-card cents", () => {
    assert.deepEqual(
      attachOneVoicePrice(
        line({
          spokenUnitPriceCents: 850,
          catalogItemId: "cat-1",
          catalogUnitPriceCents: 17500,
        }),
        4500,
      ),
      { unitPriceCents: 850, priceSource: "spoken" },
    );
  });

  it("uses catalog cents for a mapped SKU when nothing was spoken", () => {
    assert.deepEqual(
      attachOneVoicePrice(
        line({
          catalogItemId: "cat-1",
          catalogUnitPriceCents: 17500,
          name: "Outlet Install",
          unit: "each",
        }),
        9900,
      ),
      { unitPriceCents: 17500, priceSource: "catalog" },
    );
  });

  it("fills learned cents on an exact rate-card hit for adhoc lines", () => {
    assert.deepEqual(
      attachOneVoicePrice(line(), 5200),
      { unitPriceCents: 5200, priceSource: "learned" },
    );
  });

  it("stays null when there is no spoken, catalog, or learned price", () => {
    assert.deepEqual(attachOneVoicePrice(line(), null), {
      unitPriceCents: null,
      priceSource: "unknown",
    });
  });

  it("computes labor unit price from signup hourly when the line is hours", () => {
    assert.deepEqual(
      attachOneVoicePrice(
        line({ name: "Labor", quantity: 2, unit: "hour" }),
        null,
        7500,
      ),
      { unitPriceCents: 7500, priceSource: "computed" },
    );
  });

  it("does not invent a material/SKU price from hourly", () => {
    assert.deepEqual(attachOneVoicePrice(line({ unit: "foot" }), null, 7500), {
      unitPriceCents: null,
      priceSource: "unknown",
    });
  });

  it("lets spoken and learned beat computed labor", () => {
    assert.equal(
      attachOneVoicePrice(
        line({ unit: "hour", spokenUnitPriceCents: 9000 }),
        5000,
        7500,
      ).priceSource,
      "spoken",
    );
    assert.equal(
      attachOneVoicePrice(line({ unit: "hour" }), 6000, 7500).priceSource,
      "learned",
    );
  });

  it("computes material sell from spoken cost × signup markup", () => {
    assert.deepEqual(
      attachOneVoicePrice(
        line({ spokenMaterialCostCents: 4000, unit: "each" }),
        null,
        7500,
        20,
      ),
      { unitPriceCents: 4800, priceSource: "computed" },
    );
  });

  it("lets spoken sell price win over cost × markup", () => {
    assert.deepEqual(
      attachOneVoicePrice(
        line({
          spokenUnitPriceCents: 850,
          spokenMaterialCostCents: 4000,
        }),
        5200,
        7500,
        20,
      ),
      { unitPriceCents: 850, priceSource: "spoken" },
    );
  });

  it("lets catalog and learned beat cost × markup", () => {
    assert.equal(
      attachOneVoicePrice(
        line({
          catalogItemId: "cat-1",
          catalogUnitPriceCents: 17500,
          spokenMaterialCostCents: 4000,
        }),
        9900,
        null,
        20,
      ).priceSource,
      "catalog",
    );
    assert.equal(
      attachOneVoicePrice(
        line({ spokenMaterialCostCents: 4000 }),
        5200,
        null,
        20,
      ).priceSource,
      "learned",
    );
  });

  it("does not invent a material price from markup without a cost", () => {
    assert.deepEqual(attachOneVoicePrice(line({ unit: "foot" }), null, 7500, 20), {
      unitPriceCents: null,
      priceSource: "unknown",
    });
  });

  it("does not treat a spoken cost as a sell price when markup is missing", () => {
    assert.deepEqual(
      attachOneVoicePrice(line({ spokenMaterialCostCents: 4000 }), null, null, null),
      { unitPriceCents: null, priceSource: "unknown" },
    );
  });

  it("computes with markup 0 as sell = cost", () => {
    assert.deepEqual(
      attachOneVoicePrice(line({ spokenMaterialCostCents: 4000 }), null, null, 0),
      { unitPriceCents: 4000, priceSource: "computed" },
    );
  });

  it("does not apply material markup to labor hour lines", () => {
    assert.deepEqual(
      attachOneVoicePrice(
        line({
          name: "Labor",
          unit: "hour",
          spokenMaterialCostCents: 4000,
        }),
        null,
        7500,
        20,
      ),
      { unitPriceCents: 7500, priceSource: "computed" },
    );
    assert.deepEqual(
      attachOneVoicePrice(
        line({
          name: "Labor",
          unit: "hour",
          spokenMaterialCostCents: 4000,
        }),
        null,
        null,
        20,
      ),
      { unitPriceCents: null, priceSource: "unknown" },
    );
  });

  it("does not treat a zero or negative lookup as a price", () => {
    assert.equal(attachOneVoicePrice(line(), 0).unitPriceCents, null);
    assert.equal(attachOneVoicePrice(line(), -100).unitPriceCents, null);
  });
});

describe("voiceLineNeedsRateCard", () => {
  it("skips lookup when spoken or catalog cents already exist", () => {
    assert.equal(voiceLineNeedsRateCard(line({ spokenUnitPriceCents: 100 })), false);
    assert.equal(
      voiceLineNeedsRateCard(
        line({ catalogItemId: "cat-1", catalogUnitPriceCents: 5000 }),
      ),
      false,
    );
  });

  it("looks up only when unit is a canonical catalog unit", () => {
    assert.equal(voiceLineNeedsRateCard(line()), true);
    assert.equal(voiceLineNeedsRateCard(line({ unit: null })), false);
    assert.equal(voiceLineNeedsRateCard(line({ unit: "linear_ft" })), false);
  });
});

describe("attachVoiceLinePrices", () => {
  it("does not call rate-card for catalog SKUs or spoken prices", async () => {
    const calls: unknown[] = [];
    const priced = await attachVoiceLinePrices(
      [
        line({
          catalogItemId: "cat-1",
          name: "Outlet Install",
          catalogUnitPriceCents: 17500,
          spokenUnitPriceCents: null,
        }),
        line({ spokenUnitPriceCents: 900, name: "Tear-out" }),
      ],
      (args) => {
        calls.push(args);
        return 9999;
      },
      "electrical",
    );
    assert.equal(calls.length, 0);
    assert.equal(priced[0]?.unitPriceCents, 17500);
    assert.equal(priced[0]?.priceSource, "catalog");
    assert.equal(priced[1]?.unitPriceCents, 900);
    assert.equal(priced[1]?.priceSource, "spoken");
  });

  it("uses the injected exact lookup for an unpriced adhoc line", async () => {
    const priced = await attachVoiceLinePrices(
      [line()],
      ({ name, unit, trade }) => {
        assert.equal(name, "Laminate cabinets");
        assert.equal(unit, "foot");
        assert.equal(trade, "plumbing");
        return 180000;
      },
      "plumbing",
    );
    assert.equal(priced[0]?.catalogItemId, null);
    assert.equal(priced[0]?.unitPriceCents, 180000);
    assert.equal(priced[0]?.priceSource, "learned");
  });

  it("computes cost × markup on an unpriced adhoc line after rate-card miss", async () => {
    const priced = await attachVoiceLinePrices(
      [line({ spokenMaterialCostCents: 10000 })],
      () => null,
      "plumbing",
      7500,
      15,
    );
    assert.equal(priced[0]?.unitPriceCents, 11500);
    assert.equal(priced[0]?.priceSource, "computed");
  });

  it("applies spoken $ > learned exact > labor×hourly > blank in one attach pass", async () => {
    const lookups: string[] = [];
    const priced = await attachVoiceLinePrices(
      [
        line({
          name: "Tear-out",
          quantity: 1,
          unit: "job",
          spokenUnitPriceCents: 900,
        }),
        line({ name: "Laminate cabinets", quantity: 14, unit: "foot" }),
        line({ name: "Labor", quantity: 2, unit: "hour" }),
        line({ name: "Mystery assembly", quantity: 1, unit: "job" }),
      ],
      ({ name }) => {
        lookups.push(name);
        return name === "Laminate cabinets" ? 180000 : null;
      },
      "plumbing",
      7500,
    );

    assert.deepEqual(
      priced.map((item) => ({
        name: item.name,
        unitPriceCents: item.unitPriceCents,
        priceSource: item.priceSource,
        catalogItemId: item.catalogItemId,
      })),
      [
        { name: "Tear-out", unitPriceCents: 900, priceSource: "spoken", catalogItemId: null },
        {
          name: "Laminate cabinets",
          unitPriceCents: 180000,
          priceSource: "learned",
          catalogItemId: null,
        },
        { name: "Labor", unitPriceCents: 7500, priceSource: "computed", catalogItemId: null },
        {
          name: "Mystery assembly",
          unitPriceCents: null,
          priceSource: "unknown",
          catalogItemId: null,
        },
      ],
    );
    assert.equal(lookups.includes("Tear-out"), false);
    assert.deepEqual(lookups, ["Laminate cabinets", "Labor", "Mystery assembly"]);
  });

  it("does not invent a learned price from a similar name", async () => {
    const priced = await attachVoiceLinePrices(
      [line({ name: "Copper Pipes", unit: "foot" })],
      ({ name }) => (name === "Copper Pipe" ? 4500 : null),
      "plumbing",
      7500,
    );
    assert.equal(priced[0]?.unitPriceCents, null);
    assert.equal(priced[0]?.priceSource, "unknown");
  });
});

describe("lookupExactRateCardCents", () => {
  it("returns learned cents on an exact name+unit+trade hit and null on miss", async () => {
    const row: RateCardRow = {
      id: "11111111-1111-4111-8111-111111111111",
      contractor_id: CONTRACTOR_ID,
      normalized_name: "laminate cabinets",
      display_name: "Laminate cabinets",
      unit: "foot",
      trade: "plumbing",
      trade_key: "plumbing",
      unit_price_cents: 180000,
      use_count: 2,
      source: "typed",
      price_history: [],
      created_at: new Date("2026-09-14T21:00:00.000Z"),
      updated_at: new Date("2026-09-14T21:00:00.000Z"),
    };
    const queryFn: RateCardQueryFn = async (sql, params) => {
      assert.equal(sql, SELECT_RATE_CARD_BY_KEY_SQL);
      if (
        params?.[0] === CONTRACTOR_ID &&
        params?.[1] === "laminate cabinets" &&
        params?.[2] === "foot" &&
        params?.[3] === "plumbing"
      ) {
        return { rows: [row] };
      }
      return { rows: [] };
    };

    assert.equal(
      await lookupExactRateCardCents(queryFn, {
        contractorId: CONTRACTOR_ID,
        name: "Laminate Cabinets",
        unit: "foot",
        trade: "plumbing",
      }),
      180000,
    );
    assert.equal(
      await lookupExactRateCardCents(queryFn, {
        contractorId: CONTRACTOR_ID,
        name: "Laminate cabinets",
        unit: "each",
        trade: "plumbing",
      }),
      null,
    );
    assert.equal(
      await lookupExactRateCardCents(queryFn, {
        contractorId: CONTRACTOR_ID,
        name: "Laminate cabinet",
        unit: "foot",
        trade: "plumbing",
      }),
      null,
    );
  });

  it("retries the empty trade_key when the contractor trade misses", async () => {
    const queryFn: RateCardQueryFn = async (_sql, params) => {
      if (params?.[3] === "") {
        return {
          rows: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              contractor_id: CONTRACTOR_ID,
              normalized_name: "laminate cabinets",
              display_name: "Laminate cabinets",
              unit: "foot",
              trade: null,
              trade_key: "",
              unit_price_cents: 12500,
              use_count: 1,
              source: "typed",
              price_history: [],
              created_at: new Date("2026-09-14T21:00:00.000Z"),
              updated_at: new Date("2026-09-14T21:00:00.000Z"),
            } satisfies RateCardRow,
          ],
        };
      }
      return { rows: [] };
    };

    assert.equal(
      await lookupExactRateCardCents(queryFn, {
        contractorId: CONTRACTOR_ID,
        name: "Laminate cabinets",
        unit: "foot",
        trade: "plumbing",
      }),
      12500,
    );
  });
});

describe("computeMaterialSellCents / parseSignupMarkupPercent", () => {
  it("rounds integer cents from cost × (1 + markup/100)", () => {
    assert.equal(computeMaterialSellCents(4000, 20), 4800);
    assert.equal(computeMaterialSellCents(333, 15), 383);
    assert.equal(computeMaterialSellCents(1000, 0), 1000);
  });

  it("does not invent a sell price without a positive cost or a valid markup", () => {
    assert.equal(computeMaterialSellCents(0, 20), null);
    assert.equal(computeMaterialSellCents(4000, -1), null);
    assert.equal(computeMaterialSellCents(4000, 101), null);
    assert.equal(computeMaterialSellCents(4000, 20.5), null);
  });

  it("accepts signup markup 0-100 and rejects anything else", () => {
    assert.equal(parseSignupMarkupPercent(0), 0);
    assert.equal(parseSignupMarkupPercent(20), 20);
    assert.equal(parseSignupMarkupPercent(100), 100);
    assert.equal(parseSignupMarkupPercent(null), null);
    assert.equal(parseSignupMarkupPercent(101), null);
    assert.equal(parseSignupMarkupPercent(15.5), null);
  });
});

describe("snapshotUnitPriceCents", () => {
  it("persists unknown as 0 so NOT NULL snapshots stay valid", () => {
    assert.equal(snapshotUnitPriceCents(null), 0);
    assert.equal(snapshotUnitPriceCents(850), 850);
  });
});

describe("ensureLaborLineFromSpokenHours / parseSpokenHours", () => {
  it("accepts integer hours >= 1", () => {
    assert.equal(parseSpokenHours(2), 2);
    assert.equal(parseSpokenHours(1), 1);
    assert.equal(parseSpokenHours(0), null);
    assert.equal(parseSpokenHours(1.5), null);
    assert.equal(parseSpokenHours(null), null);
  });

  it("adds a Labor hour line when spoken hours exist and no hour line is present", () => {
    const added = ensureLaborLineFromSpokenHours([line()], 2);
    assert.equal(added.length, 2);
    assert.equal(added[1]?.name, "Labor");
    assert.equal(added[1]?.quantity, 2);
    assert.equal(added[1]?.unit, "hour");
    assert.equal(added[1]?.catalogItemId, null);
    assert.equal(added[1]?.spokenUnitPriceCents, null);
    assert.equal(added[1]?.spokenMaterialCostCents, null);
    assert.equal(isLaborVoiceLine(added[1]!), true);
  });

  it("does not duplicate when an hour-unit line already exists", () => {
    const existing = [line({ name: "Labor", quantity: 2, unit: "hour" })];
    assert.equal(ensureLaborLineFromSpokenHours(existing, 2).length, 1);
  });
});

const here = path.dirname(fileURLToPath(import.meta.url));

describe("voice-processor material markup wiring", () => {
  it("loads signup markup_percent and extracts cost separately from sell price", () => {
    const src = readFileSync(path.join(here, "voice-processor.ts"), "utf8");
    assert.match(src, /SELECT trade, hourly_rate_cents, markup_percent FROM contractors/);
    assert.match(src, /parseSignupMarkupPercent\(contractorRow\?\.markup_percent\)/);
    assert.match(src, /markupPercent,/);
    assert.match(src, /spokenMaterialCostCents/);
    assert.match(src, /spokenUnitPriceCents is integer cents ONLY if the contractor stated a sell\/charge price/);
  });

  it("attaches prices through the async exact-lookup path before commit", () => {
    const src = readFileSync(path.join(here, "voice-processor.ts"), "utf8");
    assert.match(src, /validateAndBuildLineItemsAsync/);
    assert.match(src, /lookupExactRateCardCents/);
    assert.match(src, /replaceVoiceQuoteLines/);
    assert.match(
      src,
      /spoken sell → catalog SKU → exact rate-card → computed labor/,
    );
  });
});
