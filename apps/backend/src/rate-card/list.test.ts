import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COUNT_RATE_CARD_LIST_SQL,
  DELETE_RATE_CARD_SQL,
  RATE_CARD_LIST_DEFAULT_LIMIT,
  RATE_CARD_LIST_MAX_LIMIT,
  SELECT_RATE_CARD_LIST_SQL,
  buildRateCardListSql,
  deleteRateCardEntry,
  isRateCardExactLookupQuery,
  listRateCardEntries,
  parseRateCardListQuery,
  parseRateCardListSearch,
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
    const isCount = sql.includes("COUNT(*)::int AS total");
    const isSelect = sql.includes("ORDER BY normalized_name ASC, unit ASC, trade_key ASC");
    if (isCount || isSelect) {
      const contractorId = params?.[0];
      let scoped = stored.filter((row) => row.contractor_id === contractorId);
      if (sql.includes("position(")) {
        const q = params?.[1] as string;
        scoped = scoped.filter((row) => row.normalized_name.includes(q));
      }
      const unitSlot = sql.match(/unit = \$(\d+)/);
      if (unitSlot) {
        const unit = params?.[Number(unitSlot[1]) - 1] as string;
        scoped = scoped.filter((row) => row.unit === unit);
      }
      if (isCount) {
        return { rows: [{ total: scoped.length }] };
      }
      scoped.sort((a, b) => {
        const name = a.normalized_name.localeCompare(b.normalized_name);
        if (name !== 0) return name;
        const unit = a.unit.localeCompare(b.unit);
        if (unit !== 0) return unit;
        return a.trade_key.localeCompare(b.trade_key);
      });
      const limit = params?.[params.length - 2] as number;
      const offset = params?.[params.length - 1] as number;
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
    assert.equal(isRateCardExactLookupQuery({ q: "pipe" }), false);
    assert.equal(isRateCardExactLookupQuery({ search: "pipe" }), false);
    assert.equal(isRateCardExactLookupQuery({ name: "Copper Pipe", q: "pipe" }), true);
  });
});

describe("parseRateCardListSearch", () => {
  it("normalizes q, aliases search, and treats blank as no filter", () => {
    assert.deepEqual(parseRateCardListSearch({ q: "  Copper   PIPE " }), {
      ok: true,
      q: "copper pipe",
    });
    assert.deepEqual(parseRateCardListSearch({ search: "PIPE" }), { ok: true, q: "pipe" });
    assert.deepEqual(parseRateCardListSearch({ q: "pipe", search: "outlet" }), {
      ok: true,
      q: "pipe",
    });
    assert.deepEqual(parseRateCardListSearch({ q: "   " }), { ok: true });
    assert.deepEqual(parseRateCardListSearch({}), { ok: true });
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

  it("accepts optional q/search and unit on the list, not as exact lookup keys", () => {
    assert.deepEqual(parseRateCardListQuery({ q: "  PIPE ", unit: "foot" }), {
      ok: true,
      limit: RATE_CARD_LIST_DEFAULT_LIMIT,
      offset: 0,
      q: "pipe",
      unit: "foot",
    });
    assert.deepEqual(parseRateCardListQuery({ search: "outlet", unit: "per vent" }), {
      ok: true,
      limit: RATE_CARD_LIST_DEFAULT_LIMIT,
      offset: 0,
      q: "outlet",
      unit: "each",
    });
    assert.equal(parseRateCardListQuery({ unit: "furlong" }).ok, false);
  });
});

describe("SELECT_RATE_CARD_LIST_SQL", () => {
  it("orders by the exact-match normalized_name key, not fuzzy search", () => {
    assert.match(SELECT_RATE_CARD_LIST_SQL, /ORDER BY normalized_name ASC, unit ASC, trade_key ASC/);
    assert.match(SELECT_RATE_CARD_LIST_SQL, /WHERE contractor_id = \$1/);
    assert.doesNotMatch(SELECT_RATE_CARD_LIST_SQL, /similarity|embedding|tsvector|fuzzy/i);
  });
});

describe("buildRateCardListSql", () => {
  it("uses position() substring on normalized_name, not embeddings or exact-key SQL", () => {
    const filtered = buildRateCardListSql({ q: "pipe" });
    assert.match(filtered.selectSql, /position\(\$2 in normalized_name\) > 0/);
    assert.match(filtered.countSql, /position\(\$2 in normalized_name\) > 0/);
    assert.deepEqual(filtered.filterParams, ["pipe"]);
    assert.notEqual(filtered.selectSql, SELECT_RATE_CARD_BY_KEY_SQL);
    assert.doesNotMatch(filtered.selectSql, /normalized_name = /);
    assert.doesNotMatch(filtered.selectSql, /similarity|embedding|tsvector|fuzzy|ILIKE/i);
  });

  it("ANDs optional unit without turning q into a LIKE wildcard pattern", () => {
    const both = buildRateCardListSql({ q: "%pipe%", unit: "foot" });
    assert.match(both.selectSql, /position\(\$2 in normalized_name\) > 0 AND unit = \$3/);
    assert.deepEqual(both.filterParams, ["%pipe%", "foot"]);
    assert.match(both.selectSql, /LIMIT \$4 OFFSET \$5/);
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

  it("filters list mode by normalized name substring and keeps stored cents", async () => {
    const pipe = entryRow();
    const outlet = entryRow({
      id: SECOND_ID,
      normalized_name: "outlet swap",
      display_name: "Outlet Swap",
      unit: "each",
      unit_price_cents: 8500,
      source: "typed",
    });
    const piping = entryRow({
      id: "33333333-3333-4333-8333-333333333333",
      normalized_name: "drain snake",
      display_name: "Drain Snake",
      unit: "job",
      unit_price_cents: 12000,
    });
    const { calls, queryFn } = mockListDb([pipe, outlet, piping]);

    const outcome = await listRateCardEntries(queryFn, {
      contractorId: CONTRACTOR_ID,
      query: { q: "  PIPE " },
    });
    assert.equal(outcome.status, 200);
    if (outcome.status !== 200) return;
    assert.equal(outcome.json.total, 1);
    assert.equal(outcome.json.entries.length, 1);
    assert.equal(outcome.json.entries[0]?.displayName, "Copper Pipe");
    assert.equal(outcome.json.entries[0]?.unitPriceCents, 4500);
    assert.equal(calls[0]?.sql, buildRateCardListSql({ q: "pipe" }).countSql);
    assert.deepEqual(calls[0]?.params, [CONTRACTOR_ID, "pipe"]);
    assert.notEqual(calls[1]?.sql, SELECT_RATE_CARD_BY_KEY_SQL);
    assert.match(calls[1]?.sql ?? "", /position\(\$2 in normalized_name\) > 0/);
  });

  it("accepts search as a q alias and optional unit, and treats LIKE metacharacters as literal", async () => {
    const pipe = entryRow();
    const percentName = entryRow({
      id: SECOND_ID,
      normalized_name: "%pipe%",
      display_name: "%Pipe%",
      unit_price_cents: 9900,
    });
    const footOnly = entryRow({
      id: "33333333-3333-4333-8333-333333333333",
      normalized_name: "copper pipe",
      display_name: "Copper Pipe job",
      unit: "job",
      unit_price_cents: 15000,
    });
    const { queryFn } = mockListDb([pipe, percentName, footOnly]);

    const bySearch = await listRateCardEntries(queryFn, {
      contractorId: CONTRACTOR_ID,
      query: { search: "Pipe" },
    });
    assert.equal(bySearch.status, 200);
    if (bySearch.status !== 200) return;
    assert.equal(bySearch.json.total, 3);

    const literal = await listRateCardEntries(queryFn, {
      contractorId: CONTRACTOR_ID,
      query: { q: "%pipe%" },
    });
    assert.equal(literal.status, 200);
    if (literal.status !== 200) return;
    assert.equal(literal.json.total, 1);
    assert.equal(literal.json.entries[0]?.unitPriceCents, 9900);

    const unitFiltered = await listRateCardEntries(queryFn, {
      contractorId: CONTRACTOR_ID,
      query: { q: "copper", unit: "foot" },
    });
    assert.equal(unitFiltered.status, 200);
    if (unitFiltered.status !== 200) return;
    assert.equal(unitFiltered.json.total, 1);
    assert.equal(unitFiltered.json.entries[0]?.unit, "foot");
    assert.equal(unitFiltered.json.entries[0]?.unitPriceCents, 4500);
  });

  it("paginates the filtered total and does not invent rows on a miss", async () => {
    const rows = [
      entryRow({ id: ENTRY_ID, normalized_name: "copper pipe", display_name: "Copper Pipe" }),
      entryRow({
        id: SECOND_ID,
        normalized_name: "copper fitting",
        display_name: "Copper Fitting",
        unit: "each",
        unit_price_cents: 2100,
      }),
    ];
    const { queryFn } = mockListDb(rows);
    const page = await listRateCardEntries(queryFn, {
      contractorId: CONTRACTOR_ID,
      query: { q: "copper", limit: 1, offset: 1 },
    });
    assert.equal(page.status, 200);
    if (page.status !== 200) return;
    assert.equal(page.json.total, 2);
    assert.equal(page.json.entries.length, 1);
    assert.equal(page.json.entries[0]?.displayName, "Copper Pipe");
    assert.equal(page.json.entries[0]?.unitPriceCents, 4500);

    const miss = await listRateCardEntries(queryFn, {
      contractorId: CONTRACTOR_ID,
      query: { q: "thermostat" },
    });
    assert.deepEqual(miss, {
      status: 200,
      json: { entries: [], limit: RATE_CARD_LIST_DEFAULT_LIMIT, offset: 0, total: 0 },
    });
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
