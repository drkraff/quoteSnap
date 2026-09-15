import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COUNT_RATE_CARD_LIST_SQL,
  DELETE_RATE_CARD_SQL,
  RATE_CARD_LIST_DEFAULT_LIMIT,
  RATE_CARD_LIST_MAX_LIMIT,
  SELECT_RATE_CARD_LIST_SQL,
  deleteRateCardEntry,
  isRateCardExactLookupQuery,
  listRateCardEntries,
  parseRateCardListQuery,
} from "./list.js";
import { SELECT_RATE_CARD_BY_KEY_SQL, type RateCardQueryFn, type RateCardRow } from "./upsert.js";

const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CONTRACTOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENTRY_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

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
    use_count: 3,
    source: "imported",
    price_history: [
      { unit_price_cents: 4500, recorded_at: "2026-09-14T21:00:00.000Z" },
    ],
    created_at: new Date("2026-09-14T21:00:00.000Z"),
    updated_at: new Date("2026-09-14T21:00:00.000Z"),
    ...overrides,
  };
}

function mockListDb(rows: RateCardRow[]): {
  calls: Array<{ sql: string; params: unknown[] | undefined }>;
  queryFn: RateCardQueryFn;
} {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const stored = [...rows];
  const queryFn: RateCardQueryFn = async (sql, params) => {
    calls.push({ sql, params });
    if (sql === COUNT_RATE_CARD_LIST_SQL) {
      const contractorId = params?.[0];
      return {
        rows: [{ total: stored.filter((row) => row.contractor_id === contractorId).length }],
      };
    }
    if (sql === SELECT_RATE_CARD_LIST_SQL) {
      const contractorId = params?.[0];
      const limit = params?.[1] as number;
      const offset = params?.[2] as number;
      const scoped = stored
        .filter((row) => row.contractor_id === contractorId)
        .sort((a, b) => {
          const name = a.normalized_name.localeCompare(b.normalized_name);
          if (name !== 0) return name;
          const unit = a.unit.localeCompare(b.unit);
          if (unit !== 0) return unit;
          return a.trade_key.localeCompare(b.trade_key);
        });
      return { rows: scoped.slice(offset, offset + limit) };
    }
    if (sql === DELETE_RATE_CARD_SQL) {
      const id = params?.[0];
      const contractorId = params?.[1];
      const index = stored.findIndex(
        (row) => row.id === id && row.contractor_id === contractorId,
      );
      if (index < 0) {
        return { rows: [] };
      }
      const [removed] = stored.splice(index, 1);
      return { rows: [{ id: removed.id }] };
    }
    throw new Error(`unexpected sql: ${sql}`);
  };
  return { calls, queryFn };
}

describe("isRateCardExactLookupQuery", () => {
  it("keeps GET ?name as exact lookup and treats omitted name as the list", () => {
    assert.equal(isRateCardExactLookupQuery({ name: "Copper Pipe" }), true);
    assert.equal(isRateCardExactLookupQuery({ name: "" }), true);
    assert.equal(isRateCardExactLookupQuery({}), false);
    assert.equal(isRateCardExactLookupQuery({ limit: "50" }), false);
  });
});

describe("parseRateCardListQuery", () => {
  it("defaults limit/offset and accepts string query params from Express", () => {
    assert.deepEqual(parseRateCardListQuery({}), {
      ok: true,
      limit: RATE_CARD_LIST_DEFAULT_LIMIT,
      offset: 0,
    });
    assert.deepEqual(parseRateCardListQuery({ limit: "25", offset: "10" }), {
      ok: true,
      limit: 25,
      offset: 10,
    });
  });

  it("rejects out-of-range or non-integer pagination", () => {
    assert.equal(parseRateCardListQuery({ limit: 0 }).ok, false);
    assert.equal(parseRateCardListQuery({ limit: RATE_CARD_LIST_MAX_LIMIT + 1 }).ok, false);
    assert.equal(parseRateCardListQuery({ limit: "1.5" }).ok, false);
    assert.equal(parseRateCardListQuery({ offset: -1 }).ok, false);
    assert.equal(parseRateCardListQuery({ offset: "nope" }).ok, false);
  });
});

describe("SELECT_RATE_CARD_LIST_SQL", () => {
  it("orders by the exact-match normalized_name key, not fuzzy search", () => {
    assert.match(SELECT_RATE_CARD_LIST_SQL, /ORDER BY normalized_name ASC, unit ASC, trade_key ASC/);
    assert.match(SELECT_RATE_CARD_LIST_SQL, /WHERE contractor_id = \$1/);
    assert.doesNotMatch(SELECT_RATE_CARD_LIST_SQL, /similarity|embedding|tsvector|fuzzy/i);
  });
});

describe("listRateCardEntries", () => {
  it("returns contractor-scoped rows with source, last price, unit, and use count", async () => {
    const imported = entryRow();
    const typed = entryRow({
      id: SECOND_ID,
      normalized_name: "outlet swap",
      display_name: "Outlet Swap",
      unit: "each",
      trade: null,
      trade_key: "",
      unit_price_cents: 8500,
      use_count: 1,
      source: "typed",
    });
    const other = entryRow({
      id: "33333333-3333-4333-8333-333333333333",
      contractor_id: OTHER_CONTRACTOR_ID,
      normalized_name: "secret row",
      display_name: "Secret Row",
    });
    const { calls, queryFn } = mockListDb([imported, typed, other]);

    const outcome = await listRateCardEntries(queryFn, {
      contractorId: CONTRACTOR_ID,
      query: {},
    });

    assert.equal(outcome.status, 200);
    if (outcome.status !== 200) return;
    assert.equal(outcome.json.total, 2);
    assert.equal(outcome.json.limit, RATE_CARD_LIST_DEFAULT_LIMIT);
    assert.equal(outcome.json.offset, 0);
    assert.equal(outcome.json.entries.length, 2);
    assert.equal(outcome.json.entries[0]?.displayName, "Copper Pipe");
    assert.equal(outcome.json.entries[0]?.unitPriceCents, 4500);
    assert.equal(outcome.json.entries[0]?.unit, "foot");
    assert.equal(outcome.json.entries[0]?.useCount, 3);
    assert.equal(outcome.json.entries[0]?.source, "imported");
    assert.equal(outcome.json.entries[1]?.displayName, "Outlet Swap");
    assert.equal(outcome.json.entries[1]?.source, "typed");
    assert.deepEqual(calls[0]?.sql, COUNT_RATE_CARD_LIST_SQL);
    assert.deepEqual(calls[0]?.params, [CONTRACTOR_ID]);
    assert.deepEqual(calls[1]?.sql, SELECT_RATE_CARD_LIST_SQL);
    assert.deepEqual(calls[1]?.params, [
      CONTRACTOR_ID,
      RATE_CARD_LIST_DEFAULT_LIMIT,
      0,
    ]);
    assert.notEqual(calls[1]?.sql, SELECT_RATE_CARD_BY_KEY_SQL);
  });

  it("paginates with limit/offset and does not invent empty rows", async () => {
    const rows = [
      entryRow({ id: ENTRY_ID, normalized_name: "aaa", display_name: "Aaa" }),
      entryRow({
        id: SECOND_ID,
        normalized_name: "bbb",
        display_name: "Bbb",
        unit: "each",
      }),
    ];
    const { queryFn } = mockListDb(rows);
    const page = await listRateCardEntries(queryFn, {
      contractorId: CONTRACTOR_ID,
      query: { limit: 1, offset: 1 },
    });
    assert.equal(page.status, 200);
    if (page.status !== 200) return;
    assert.equal(page.json.total, 2);
    assert.equal(page.json.entries.length, 1);
    assert.equal(page.json.entries[0]?.displayName, "Bbb");
    assert.equal(page.json.limit, 1);
    assert.equal(page.json.offset, 1);

    const empty = await listRateCardEntries(queryFn, {
      contractorId: OTHER_CONTRACTOR_ID,
      query: {},
    });
    assert.deepEqual(empty, {
      status: 200,
      json: { entries: [], limit: RATE_CARD_LIST_DEFAULT_LIMIT, offset: 0, total: 0 },
    });
  });

  it("returns 400 without querying when pagination is invalid", async () => {
    let queried = false;
    const outcome = await listRateCardEntries(
      async () => {
        queried = true;
        return { rows: [] };
      },
      { contractorId: CONTRACTOR_ID, query: { limit: 0 } },
    );
    assert.equal(queried, false);
    assert.equal(outcome.status, 400);
  });
});

describe("deleteRateCardEntry", () => {
  it("deletes only the JWT contractor's row by id", async () => {
    const { calls, queryFn } = mockListDb([entryRow()]);
    const outcome = await deleteRateCardEntry(queryFn, {
      contractorId: CONTRACTOR_ID,
      id: ENTRY_ID,
    });
    assert.deepEqual(outcome, { status: 200, json: { deleted: true } });
    assert.deepEqual(calls[0]?.sql, DELETE_RATE_CARD_SQL);
    assert.deepEqual(calls[0]?.params, [ENTRY_ID, CONTRACTOR_ID]);
  });

  it("returns 404 for another contractor or missing id, 400 for junk ids", async () => {
    const { queryFn } = mockListDb([entryRow()]);
    const other = await deleteRateCardEntry(queryFn, {
      contractorId: OTHER_CONTRACTOR_ID,
      id: ENTRY_ID,
    });
    assert.deepEqual(other, { status: 404, json: { error: "Rate card entry not found" } });

    const missing = await deleteRateCardEntry(queryFn, {
      contractorId: CONTRACTOR_ID,
      id: SECOND_ID,
    });
    assert.equal(missing.status, 404);

    let queried = false;
    const junk = await deleteRateCardEntry(
      async () => {
        queried = true;
        return { rows: [] };
      },
      { contractorId: CONTRACTOR_ID, id: "not-a-uuid" },
    );
    assert.equal(queried, false);
    assert.equal(junk.status, 400);
  });
});
