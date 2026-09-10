import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INSERT_CATALOG_ITEM_SQL,
  catalogCreateInsertParams,
  insertCatalogItem,
  normalizeTradeCategory,
} from "./create.js";

const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("normalizeTradeCategory", () => {
  it("trims non-empty strings so contractor trade is stored", () => {
    assert.equal(normalizeTradeCategory("plumbing"), "plumbing");
    assert.equal(normalizeTradeCategory("  hvac  "), "hvac");
  });

  it("stores omitted, null, and blank values as NULL", () => {
    assert.equal(normalizeTradeCategory(undefined), null);
    assert.equal(normalizeTradeCategory(null), null);
    assert.equal(normalizeTradeCategory(""), null);
    assert.equal(normalizeTradeCategory("   "), null);
    assert.equal(normalizeTradeCategory(1), null);
  });
});

describe("catalogCreateInsertParams", () => {
  it("binds trade_category as the fifth INSERT param (A-15)", () => {
    assert.deepEqual(
      catalogCreateInsertParams(CONTRACTOR_ID, {
        name: "  Custom Valve  ",
        unit: "each",
        unitPriceCents: 12500,
        tradeCategory: "plumbing",
      }),
      [CONTRACTOR_ID, "Custom Valve", "each", 12500, "plumbing"]
    );
  });

  it("persists NULL when the client omits tradeCategory", () => {
    const params = catalogCreateInsertParams(CONTRACTOR_ID, {
      name: "Pipe",
      unit: "foot",
      unitPriceCents: 4500,
    });
    assert.equal(params[4], null);
  });
});

describe("insertCatalogItem", () => {
  it("runs INSERT with trade_category and returns the stored row", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const queryFn = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return {
        rows: [
          {
            id: "item-1",
            name: params?.[1],
            unit: params?.[2],
            unit_price_cents: params?.[3],
            trade_category: params?.[4],
            is_archived: false,
            created_at: new Date("2026-09-10T00:00:00.000Z"),
            updated_at: new Date("2026-09-10T00:00:00.000Z"),
          },
        ],
      };
    };

    const row = await insertCatalogItem(queryFn, CONTRACTOR_ID, {
      name: "Custom Valve",
      unit: "each",
      unitPriceCents: 12500,
      tradeCategory: "plumbing",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.sql, INSERT_CATALOG_ITEM_SQL);
    assert.deepEqual(calls[0]?.params, [
      CONTRACTOR_ID,
      "Custom Valve",
      "each",
      12500,
      "plumbing",
    ]);
    assert.deepEqual(row, {
      id: "item-1",
      name: "Custom Valve",
      unit: "each",
      unit_price_cents: 12500,
      trade_category: "plumbing",
      is_archived: false,
      created_at: new Date("2026-09-10T00:00:00.000Z"),
      updated_at: new Date("2026-09-10T00:00:00.000Z"),
    });
  });
});
