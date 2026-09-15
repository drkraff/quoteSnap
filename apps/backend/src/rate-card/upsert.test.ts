import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  INSERT_RATE_CARD_SQL,
  RATE_CARD_HISTORY_CAP,
  SELECT_RATE_CARD_BY_KEY_SQL,
  UPDATE_RATE_CARD_SQL,
  appendPriceHistory,
  historyToJsonb,
  lookupRateCardEntry,
  parseRateCardLookupQuery,
  parseRateCardUpsertBody,
  upsertRateCardEntry,
  type RateCardQueryFn,
  type RateCardRow,
} from "./upsert.js";

const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CONTRACTOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENTRY_ID = "11111111-1111-4111-8111-111111111111";
const RECORDED_AT = "2026-09-14T22:00:00.000Z";

const MIGRATION_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../db/migrations/010_rate_card_entries.sql",
);

function loadMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function entryRow(overrides: Partial<RateCardRow> = {}): RateCardRow {
  return {
    id: ENTRY_ID,
    contractor_id: CONTRACTOR_ID,
    normalized_name: "copper pipe",
    display_name: "Copper Pipe",
    unit: "foot",
    trade: "plumbing",
    trade_key: "plumbing",
    unit_price_cents: 4500,
    use_count: 1,
    source: "typed",
    price_history: [
      { unit_price_cents: 4500, recorded_at: "2026-09-14T21:00:00.000Z" },
    ],
    created_at: new Date("2026-09-14T21:00:00.000Z"),
    updated_at: new Date("2026-09-14T21:00:00.000Z"),
    ...overrides,
  };
}

function mockDb(existing: RateCardRow | null = null): {
  calls: Array<{ sql: string; params: unknown[] | undefined }>;
  queryFn: RateCardQueryFn;
} {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  let stored = existing;
  const queryFn: RateCardQueryFn = async (sql, params) => {
    calls.push({ sql, params });
    if (sql === SELECT_RATE_CARD_BY_KEY_SQL) {
      if (
        stored &&
        params?.[0] === stored.contractor_id &&
        params?.[1] === stored.normalized_name &&
        params?.[2] === stored.unit &&
        params?.[3] === stored.trade_key
      ) {
        return { rows: [stored] };
      }
      return { rows: [] };
    }
    if (sql === INSERT_RATE_CARD_SQL) {
      stored = entryRow({
        contractor_id: params?.[0] as string,
        normalized_name: params?.[1] as string,
        display_name: params?.[2] as string,
        unit: params?.[3] as string,
        trade: params?.[4] as string | null,
        trade_key: (params?.[4] as string | null) ?? "",
        unit_price_cents: params?.[5] as number,
        use_count: 1,
        source: params?.[6] as RateCardRow["source"],
        price_history: JSON.parse(params?.[7] as string),
        created_at: new Date(RECORDED_AT),
        updated_at: new Date(RECORDED_AT),
      });
      return { rows: [stored] };
    }
    if (sql === UPDATE_RATE_CARD_SQL) {
      if (!stored || params?.[4] !== stored.id || params?.[5] !== stored.contractor_id) {
        return { rows: [] };
      }
      stored = {
        ...stored,
        display_name: params?.[0] as string,
        unit_price_cents: params?.[1] as number,
        use_count: stored.use_count + 1,
        source: params?.[2] as RateCardRow["source"],
        price_history: JSON.parse(params?.[3] as string),
        updated_at: new Date(RECORDED_AT),
      };
      return { rows: [stored] };
    }
    throw new Error(`unexpected sql: ${sql}`);
  };
  return { calls, queryFn };
}

describe("010_rate_card_entries.sql", () => {
  it("creates a contractor-scoped exact-match table, not a catalog or quote rewrite", () => {
    const sql = loadMigration();
    assert.match(sql, /CREATE TABLE rate_card_entries/);
    assert.match(sql, /contractor_id UUID NOT NULL REFERENCES contractors\(id\) ON DELETE CASCADE/);
    assert.match(sql, /normalized_name VARCHAR\(200\) NOT NULL/);
    assert.match(sql, /trade_key VARCHAR\(100\) NOT NULL GENERATED ALWAYS AS \(COALESCE\(trade, ''\)\) STORED/);
    assert.match(sql, /CREATE UNIQUE INDEX rate_card_entries_contractor_key/);
    assert.match(sql, /\(contractor_id, normalized_name, unit, trade_key\)/);
    assert.match(sql, /CHECK \(unit_price_cents > 0\)/);
    assert.match(sql, /CHECK \(source IN \('typed', 'confirmed'\)\)/);
    assert.doesNotMatch(sql, /ALTER TABLE catalog_items/);
    assert.doesNotMatch(sql, /ALTER TABLE quote_line_items/);
  });
});

describe("parseRateCardUpsertBody", () => {
  it("normalizes name, unit alias, and optional trade", () => {
    const parsed = parseRateCardUpsertBody({
      name: "  Copper   Pipe  ",
      unit: "per foot",
      unitPriceCents: 4500,
      trade: "  plumbing  ",
    });
    assert.deepEqual(parsed, {
      ok: true,
      displayName: "Copper Pipe",
      normalizedName: "copper pipe",
      unit: "foot",
      trade: "plumbing",
      tradeKey: "plumbing",
      unitPriceCents: 4500,
      source: "typed",
    });
  });

  it("rejects blank names, unknown units, and non-positive cents", () => {
    assert.equal(parseRateCardUpsertBody({ unit: "each", unitPriceCents: 100 }).ok, false);
    assert.equal(
      parseRateCardUpsertBody({ name: "Pipe", unit: "ea", unitPriceCents: 100 }).ok,
      false,
    );
    assert.equal(
      parseRateCardUpsertBody({ name: "Pipe", unit: "each", unitPriceCents: 0 }).ok,
      false,
    );
    assert.equal(
      parseRateCardUpsertBody({ name: "Pipe", unit: "each", unitPriceCents: 1.5 }).ok,
      false,
    );
  });

  it("defaults source to typed and accepts confirmed", () => {
    const typed = parseRateCardUpsertBody({
      name: "Pipe",
      unit: "each",
      unitPriceCents: 100,
    });
    assert.equal(typed.ok && typed.source, "typed");
    const confirmed = parseRateCardUpsertBody({
      name: "Pipe",
      unit: "each",
      unitPriceCents: 100,
      source: "confirmed",
    });
    assert.equal(confirmed.ok && confirmed.source, "confirmed");
    const imported = parseRateCardUpsertBody({
      name: "Pipe",
      unit: "each",
      unitPriceCents: 100,
      source: "imported",
    });
    assert.equal(imported.ok && imported.source, "imported");
    assert.equal(
      parseRateCardUpsertBody({
        name: "Pipe",
        unit: "each",
        unitPriceCents: 100,
        source: "ai",
      }).ok,
      false,
    );
  });
});

describe("parseRateCardLookupQuery", () => {
  it("requires name + canonical unit and treats omitted trade as empty key", () => {
    const parsed = parseRateCardLookupQuery({
      name: "Copper Pipe",
      unit: "foot",
    });
    assert.deepEqual(parsed, {
      ok: true,
      normalizedName: "copper pipe",
      unit: "foot",
      tradeKey: "",
    });
  });

  it("rejects missing name or unknown unit", () => {
    assert.equal(parseRateCardLookupQuery({ unit: "foot" }).ok, false);
    assert.equal(parseRateCardLookupQuery({ name: "Pipe", unit: "ea" }).ok, false);
  });
});

describe("appendPriceHistory", () => {
  it("appends newest last and caps at RATE_CARD_HISTORY_CAP", () => {
    const existing = Array.from({ length: RATE_CARD_HISTORY_CAP }, (_, i) => ({
      unit_price_cents: i + 1,
      recorded_at: `2026-09-01T00:00:${String(i).padStart(2, "0")}.000Z`,
    }));
    const next = appendPriceHistory(existing, 9999, RECORDED_AT);
    assert.equal(next.length, RATE_CARD_HISTORY_CAP);
    assert.equal(next[next.length - 1]?.unitPriceCents, 9999);
    assert.equal(next[0]?.unitPriceCents, 2);
  });
});

describe("upsertRateCardEntry", () => {
  it("inserts a new row on first typed price", async () => {
    const { calls, queryFn } = mockDb(null);
    const outcome = await upsertRateCardEntry(queryFn, {
      contractorId: CONTRACTOR_ID,
      recordedAtIso: RECORDED_AT,
      body: {
        name: "Copper Pipe",
        unit: "foot",
        unitPriceCents: 4500,
        trade: "plumbing",
      },
    });

    if (outcome.status !== 200) {
      assert.fail(`expected 200, got ${outcome.status}`);
    }
    assert.equal(outcome.json.entry.useCount, 1);
    assert.equal(outcome.json.entry.unitPriceCents, 4500);
    assert.equal(outcome.json.entry.normalizedName, "copper pipe");
    assert.deepEqual(calls[0]?.sql, SELECT_RATE_CARD_BY_KEY_SQL);
    assert.deepEqual(calls[0]?.params, [CONTRACTOR_ID, "copper pipe", "foot", "plumbing"]);
    assert.equal(calls[1]?.sql, INSERT_RATE_CARD_SQL);
    assert.equal(calls[1]?.params?.[0], CONTRACTOR_ID);
    assert.equal(calls[1]?.params?.[5], 4500);
    assert.equal(
      calls[1]?.params?.[7],
      historyToJsonb([{ unitPriceCents: 4500, recordedAt: RECORDED_AT }]),
    );
  });

  it("updates price and bumps use_count on the same name+unit+trade", async () => {
    const { calls, queryFn } = mockDb(entryRow());
    const outcome = await upsertRateCardEntry(queryFn, {
      contractorId: CONTRACTOR_ID,
      recordedAtIso: RECORDED_AT,
      body: {
        name: "copper pipe",
        unit: "foot",
        unitPriceCents: 5200,
        trade: "plumbing",
      },
    });

    assert.equal(outcome.status, 200);
    if (outcome.status !== 200) return;
    assert.equal(outcome.json.entry.unitPriceCents, 5200);
    assert.equal(outcome.json.entry.useCount, 2);
    assert.equal(outcome.json.entry.priceHistory.length, 2);
    assert.equal(outcome.json.entry.priceHistory[1]?.unitPriceCents, 5200);
    assert.equal(calls[1]?.sql, UPDATE_RATE_CARD_SQL);
    assert.equal(calls[1]?.params?.[1], 5200);
    assert.equal(calls[1]?.params?.[4], ENTRY_ID);
    assert.equal(calls[1]?.params?.[5], CONTRACTOR_ID);
  });

  it("does not match a different unit or trade on the same name", async () => {
    const { queryFn } = mockDb(entryRow());
    const otherUnit = await upsertRateCardEntry(queryFn, {
      contractorId: CONTRACTOR_ID,
      recordedAtIso: RECORDED_AT,
      body: { name: "Copper Pipe", unit: "each", unitPriceCents: 9900, trade: "plumbing" },
    });
    assert.equal(otherUnit.status, 200);
    if (otherUnit.status !== 200) return;
    assert.equal(otherUnit.json.entry.useCount, 1);
    assert.equal(otherUnit.json.entry.unit, "each");

    const otherTrade = await upsertRateCardEntry(queryFn, {
      contractorId: CONTRACTOR_ID,
      recordedAtIso: RECORDED_AT,
      body: { name: "Copper Pipe", unit: "foot", unitPriceCents: 1100, trade: "hvac" },
    });
    assert.equal(otherTrade.status, 200);
    if (otherTrade.status !== 200) return;
    assert.equal(otherTrade.json.entry.useCount, 1);
    assert.equal(otherTrade.json.entry.trade, "hvac");
  });

  it("scopes SELECT/INSERT to the JWT contractor", async () => {
    const { calls, queryFn } = mockDb(entryRow());
    await upsertRateCardEntry(queryFn, {
      contractorId: OTHER_CONTRACTOR_ID,
      recordedAtIso: RECORDED_AT,
      body: { name: "Copper Pipe", unit: "foot", unitPriceCents: 4500, trade: "plumbing" },
    });
    assert.deepEqual(calls[0]?.params, [
      OTHER_CONTRACTOR_ID,
      "copper pipe",
      "foot",
      "plumbing",
    ]);
    assert.equal(calls[1]?.sql, INSERT_RATE_CARD_SQL);
    assert.equal(calls[1]?.params?.[0], OTHER_CONTRACTOR_ID);
  });

  it("returns 400 without querying when the body is invalid", async () => {
    let queried = false;
    const outcome = await upsertRateCardEntry(
      async () => {
        queried = true;
        return { rows: [] };
      },
      { contractorId: CONTRACTOR_ID, body: { name: "Pipe" } },
    );
    assert.equal(queried, false);
    assert.equal(outcome.status, 400);
  });
});

describe("lookupRateCardEntry", () => {
  it("returns the row for exact normalized name + unit + trade", async () => {
    const { calls, queryFn } = mockDb(entryRow());
    const outcome = await lookupRateCardEntry(queryFn, {
      contractorId: CONTRACTOR_ID,
      query: { name: "  COPPER   PIPE ", unit: "foot", trade: "plumbing" },
    });
    assert.equal(outcome.status, 200);
    if (outcome.status !== 200) return;
    assert.equal(outcome.json.entry?.id, ENTRY_ID);
    assert.equal(outcome.json.entry?.unitPriceCents, 4500);
    assert.deepEqual(calls[0]?.params, [CONTRACTOR_ID, "copper pipe", "foot", "plumbing"]);
  });

  it("returns entry null on miss without inventing a price", async () => {
    const { queryFn } = mockDb(entryRow());
    const outcome = await lookupRateCardEntry(queryFn, {
      contractorId: CONTRACTOR_ID,
      query: { name: "Copper Pipe", unit: "each", trade: "plumbing" },
    });
    assert.deepEqual(outcome, { status: 200, json: { entry: null } });
  });

  it("does not return another contractor's row", async () => {
    const { queryFn } = mockDb(entryRow());
    const outcome = await lookupRateCardEntry(queryFn, {
      contractorId: OTHER_CONTRACTOR_ID,
      query: { name: "Copper Pipe", unit: "foot", trade: "plumbing" },
    });
    assert.deepEqual(outcome, { status: 200, json: { entry: null } });
  });

  it("matches omitted trade to the empty trade_key row", async () => {
    const { calls, queryFn } = mockDb(entryRow({ trade: null, trade_key: "" }));
    const outcome = await lookupRateCardEntry(queryFn, {
      contractorId: CONTRACTOR_ID,
      query: { name: "Copper Pipe", unit: "foot" },
    });
    assert.equal(outcome.status, 200);
    if (outcome.status !== 200) return;
    assert.equal(outcome.json.entry?.id, ENTRY_ID);
    assert.deepEqual(calls[0]?.params, [CONTRACTOR_ID, "copper pipe", "foot", ""]);
  });
});

const here = path.dirname(fileURLToPath(import.meta.url));

describe("rate card isolation", () => {
  it("is not imported by catalog or quote write (learn/attach stay out of SKU CRUD and PUT)", () => {
    const files = [
      "../quotes/quote-write.ts",
      "../catalog/create.ts",
      "../catalog/update.ts",
      "../routes/catalog.ts",
      "../routes/quotes.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(path.join(here, rel), "utf8");
      assert.doesNotMatch(src, /rate.?card/i, rel);
    }
  });

  it("does not put a guessed unitPriceCents field on the GPT extract schema", () => {
    const src = readFileSync(path.join(here, "../workers/voice-processor.ts"), "utf8");
    assert.match(src, /spokenUnitPriceCents/);
    assert.match(src, /spokenMaterialCostCents/);
    assert.doesNotMatch(src, /catalogItemId: \{ type: 'string', description: 'ID from the provided catalog' \}/);
    const schemaSlice = src.slice(src.indexOf("create_quote_items"), src.indexOf("tool_choice"));
    assert.doesNotMatch(schemaSlice, /unitPriceCents: \{ type: 'integer'/);
    assert.match(schemaSlice, /spokenMaterialCostCents/);
    assert.match(schemaSlice, /NEVER guess/);
  });
});
