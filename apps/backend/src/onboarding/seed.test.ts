import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TRADE_TEMPLATES } from "../data/trade-templates.js";
import { parseCatalogUnit } from "../catalog/units.js";
import {
  ALREADY_SEEDED_ERROR,
  INSERT_CATALOG_ITEM_SQL,
  INVALID_TRADE_ERROR,
  SELECT_CONTRACTOR_FOR_UPDATE_SQL,
  UPDATE_CONTRACTOR_TRADE_SQL,
  applyOnboardingSeed,
  parseSeedBody,
  parseTrade,
} from "./seed.js";

const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CONTRACTOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type CatalogSeedRow = {
  id: string;
  name: string;
  unit: string;
  unit_price_cents: number;
  trade_category: string;
};

function catalogRow(
  name: string,
  overrides: Partial<CatalogSeedRow> = {},
): CatalogSeedRow {
  return {
    id: `${name.replace(/\s+/g, "-").toLowerCase()}-id`,
    name,
    unit: "each",
    unit_price_cents: 1000,
    trade_category: "plumbing",
    ...overrides,
  };
}

describe("parseTrade / parseSeedBody", () => {
  it("accepts plumbing, electrical, and hvac", () => {
    for (const trade of ["plumbing", "electrical", "hvac"] as const) {
      assert.deepEqual(parseTrade(trade), { ok: true, trade });
      assert.deepEqual(parseSeedBody({ trade }), { ok: true, trade });
    }
  });

  it("rejects missing or invalid trade without implying a catalog write", () => {
    for (const body of [undefined, null, {}, { trade: "carpentry" }, { trade: "" }, []]) {
      const parsed = parseSeedBody(body);
      assert.equal(parsed.ok, false, `expected reject for ${JSON.stringify(body)}`);
      if (!parsed.ok) {
        assert.equal(parsed.error, INVALID_TRADE_ERROR);
      }
    }
  });
});

describe("applyOnboardingSeed", () => {
  function mockDb(options: {
    trade?: string | null;
    missingContractor?: boolean;
    failOnInsertIndex?: number;
    insertUnit?: string;
  } = {}) {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    let insertCount = 0;
    const queryFn = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql === SELECT_CONTRACTOR_FOR_UPDATE_SQL) {
        if (options.missingContractor) {
          return { rows: [] };
        }
        return {
          rows: [{ id: params?.[0], trade: options.trade === undefined ? null : options.trade }],
        };
      }
      if (sql === UPDATE_CONTRACTOR_TRADE_SQL) {
        if (options.trade) {
          return { rows: [] };
        }
        return { rows: [{ id: params?.[1], trade: params?.[0] }] };
      }
      if (sql === INSERT_CATALOG_ITEM_SQL) {
        if (options.failOnInsertIndex !== undefined && insertCount === options.failOnInsertIndex) {
          throw new Error("insert failed");
        }
        const name = params?.[1] as string;
        const unit = (options.insertUnit ?? params?.[2]) as string;
        const row = catalogRow(name, {
          unit,
          unit_price_cents: params?.[3] as number,
          trade_category: params?.[4] as string,
        });
        insertCount += 1;
        return { rows: [row] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    };
    return { calls, queryFn };
  }

  function callKinds(calls: Array<{ sql: string }>): string[] {
    return calls.map((c) => {
      if (c.sql === SELECT_CONTRACTOR_FOR_UPDATE_SQL) return "lock";
      if (c.sql === UPDATE_CONTRACTOR_TRADE_SQL) return "update-trade";
      if (c.sql === INSERT_CATALOG_ITEM_SQL) return "insert";
      return "other";
    });
  }

  it("locks the JWT contractor, sets trade, then inserts every template row (201)", async () => {
    const template = TRADE_TEMPLATES.plumbing;
    const { calls, queryFn } = mockDb();
    const outcome = await applyOnboardingSeed(queryFn, {
      contractorId: CONTRACTOR_ID,
      trade: "plumbing",
    });

    assert.equal(outcome.status, 201);
    if (outcome.status !== 201) return;
    assert.equal(outcome.json.trade, "plumbing");
    assert.equal(outcome.json.itemCount, template.length);
    assert.equal(outcome.json.items.length, template.length);

    const kinds = callKinds(calls);
    assert.equal(kinds[0], "lock");
    assert.equal(kinds[1], "update-trade");
    assert.equal(kinds.filter((k) => k === "insert").length, template.length);
    assert.deepEqual(kinds.slice(2), Array(template.length).fill("insert"));

    assert.deepEqual(calls[0]?.params, [CONTRACTOR_ID]);
    assert.deepEqual(calls[1]?.params, ["plumbing", CONTRACTOR_ID]);

    for (const [i, item] of template.entries()) {
      const insert = calls[2 + i];
      assert.equal(insert?.sql, INSERT_CATALOG_ITEM_SQL);
      assert.deepEqual(insert?.params, [
        CONTRACTOR_ID,
        item.name,
        parseCatalogUnit(item.unit),
        item.unitPriceCents,
        item.tradeCategory,
      ]);
      assert.equal(outcome.json.items[i]?.name, item.name);
      assert.equal(outcome.json.items[i]?.unit, parseCatalogUnit(item.unit));
      assert.equal(outcome.json.items[i]?.unitPriceCents, item.unitPriceCents);
      assert.equal(outcome.json.items[i]?.tradeCategory, item.tradeCategory);
    }
  });

  it("scopes the lock and writes to the JWT contractor, not another tenant", async () => {
    const own = mockDb();
    await applyOnboardingSeed(own.queryFn, {
      contractorId: CONTRACTOR_ID,
      trade: "hvac",
    });
    assert.deepEqual(own.calls[0]?.params, [CONTRACTOR_ID]);
    assert.deepEqual(own.calls[1]?.params, ["hvac", CONTRACTOR_ID]);
    assert.equal(own.calls[2]?.params?.[0], CONTRACTOR_ID);

    const other = mockDb();
    await applyOnboardingSeed(other.queryFn, {
      contractorId: OTHER_CONTRACTOR_ID,
      trade: "hvac",
    });
    assert.deepEqual(other.calls[0]?.params, [OTHER_CONTRACTOR_ID]);
    assert.deepEqual(other.calls[1]?.params, ["hvac", OTHER_CONTRACTOR_ID]);
    assert.equal(other.calls[2]?.params?.[0], OTHER_CONTRACTOR_ID);
  });

  it("returns 409 without writing when trade is already set (fully seeded)", async () => {
    const { calls, queryFn } = mockDb({ trade: "plumbing" });
    const outcome = await applyOnboardingSeed(queryFn, {
      contractorId: CONTRACTOR_ID,
      trade: "electrical",
    });
    assert.deepEqual(outcome, {
      status: 409,
      json: { error: ALREADY_SEEDED_ERROR },
    });
    assert.deepEqual(callKinds(calls), ["lock"]);
  });

  it("throws on a mid-loop INSERT after the trade UPDATE so withTransaction can roll back", async () => {
    const { calls, queryFn } = mockDb({ failOnInsertIndex: 1 });
    await assert.rejects(
      () =>
        applyOnboardingSeed(queryFn, {
          contractorId: CONTRACTOR_ID,
          trade: "plumbing",
        }),
      /insert failed/,
    );
    const kinds = callKinds(calls);
    assert.equal(kinds[0], "lock");
    assert.equal(kinds[1], "update-trade");
    assert.equal(kinds[2], "insert");
    assert.equal(kinds[3], "insert");
    assert.equal(kinds.filter((k) => k === "insert").length, 2);
    assert.equal(
      kinds.includes("other"),
      false,
    );
  });

  it("maps stored unit aliases onto canonical units in the 201 payload (A-04)", async () => {
    const { queryFn } = mockDb({ insertUnit: "per foot" });
    const outcome = await applyOnboardingSeed(queryFn, {
      contractorId: CONTRACTOR_ID,
      trade: "plumbing",
    });
    assert.equal(outcome.status, 201);
    if (outcome.status !== 201) return;
    assert.equal(outcome.json.items[0]?.unit, "foot");
  });

  it("returns 404 when the contractor row is missing", async () => {
    const { calls, queryFn } = mockDb({ missingContractor: true });
    const outcome = await applyOnboardingSeed(queryFn, {
      contractorId: CONTRACTOR_ID,
      trade: "plumbing",
    });
    assert.deepEqual(outcome, {
      status: 404,
      json: { error: "Contractor not found" },
    });
    assert.deepEqual(callKinds(calls), ["lock"]);
  });
});
