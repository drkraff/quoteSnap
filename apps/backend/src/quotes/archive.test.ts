import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyQuoteArchivePatch,
  planQuoteArchivePatch,
  quoteArchiveUpdateSql,
} from "./archive.js";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CONTRACTOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("quoteArchiveUpdateSql", () => {
  it("archives a tenant-owned row without requiring it to still be active (retry-safe)", () => {
    const sql = quoteArchiveUpdateSql(true);
    assert.match(sql, /UPDATE quotes/);
    assert.match(sql, /SET is_archived = TRUE/);
    assert.match(sql, /contractor_id = \$2/);
    assert.doesNotMatch(sql, /AND is_archived = FALSE/);
  });

  it("unarchives by tenant without requiring the row to still be archived", () => {
    const sql = quoteArchiveUpdateSql(false);
    assert.match(sql, /SET is_archived = FALSE/);
    assert.match(sql, /contractor_id = \$2/);
    assert.doesNotMatch(sql, /AND is_archived = TRUE/);
    assert.doesNotMatch(sql, /AND is_archived = FALSE/);
  });
});

describe("planQuoteArchivePatch", () => {
  it("binds quote id then contractor_id for tenant scoping", () => {
    const plan = planQuoteArchivePatch(QUOTE_ID, CONTRACTOR_ID, { archived: true });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.archived, true);
    assert.deepEqual(plan.params, [QUOTE_ID, CONTRACTOR_ID]);
  });

  it("returns 400 without SQL when archived is invalid", () => {
    const plan = planQuoteArchivePatch(QUOTE_ID, CONTRACTOR_ID, { archived: "nope" });
    assert.deepEqual(plan, {
      ok: false,
      status: 400,
      error: "archived must be a boolean",
    });
  });

  it("scopes the UPDATE to the JWT contractor, not another tenant", () => {
    const own = planQuoteArchivePatch(QUOTE_ID, CONTRACTOR_ID, { archived: true });
    const other = planQuoteArchivePatch(QUOTE_ID, OTHER_CONTRACTOR_ID, { archived: true });
    assert.equal(own.ok, true);
    assert.equal(other.ok, true);
    if (!own.ok || !other.ok) return;
    assert.deepEqual(own.params, [QUOTE_ID, CONTRACTOR_ID]);
    assert.deepEqual(other.params, [QUOTE_ID, OTHER_CONTRACTOR_ID]);
  });
});

describe("applyQuoteArchivePatch", () => {
  it("archives a tenant-owned row and returns archived true", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const outcome = await applyQuoteArchivePatch(
      async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [{ id: QUOTE_ID }] };
      },
      { quoteId: QUOTE_ID, contractorId: CONTRACTOR_ID, body: { archived: true } },
    );

    assert.equal(outcome.status, 200);
    assert.deepEqual(outcome.json, { archived: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.params, [QUOTE_ID, CONTRACTOR_ID]);
    assert.match(calls[0]?.sql ?? "", /SET is_archived = TRUE/);
  });

  it("returns 404 when the tenant-scoped update matches no row", async () => {
    const outcome = await applyQuoteArchivePatch(
      async (_sql, params) => {
        assert.deepEqual(params, [QUOTE_ID, CONTRACTOR_ID]);
        return { rows: [] };
      },
      { quoteId: QUOTE_ID, contractorId: CONTRACTOR_ID, body: { archived: true } },
    );
    assert.deepEqual(outcome, { status: 404, json: { error: "Quote not found" } });
  });

  it("does not query on a 400 body", async () => {
    let queried = false;
    const outcome = await applyQuoteArchivePatch(
      async () => {
        queried = true;
        return { rows: [{ id: QUOTE_ID }] };
      },
      { quoteId: QUOTE_ID, contractorId: CONTRACTOR_ID, body: { archived: "false" } },
    );
    assert.equal(queried, false);
    assert.deepEqual(outcome, {
      status: 400,
      json: { error: "archived must be a boolean" },
    });
  });

  it("omitted body still archives so the mobile client can PATCH without JSON", async () => {
    const outcome = await applyQuoteArchivePatch(
      async (sql) => {
        assert.match(sql, /SET is_archived = TRUE/);
        return { rows: [{ id: QUOTE_ID }] };
      },
      { quoteId: QUOTE_ID, contractorId: CONTRACTOR_ID, body: undefined },
    );
    assert.deepEqual(outcome, { status: 200, json: { archived: true } });
  });

  it("unarchives with archived false", async () => {
    const outcome = await applyQuoteArchivePatch(
      async (sql) => {
        assert.match(sql, /SET is_archived = FALSE/);
        return { rows: [{ id: QUOTE_ID }] };
      },
      { quoteId: QUOTE_ID, contractorId: CONTRACTOR_ID, body: { archived: false } },
    );
    assert.deepEqual(outcome, { status: 200, json: { archived: false } });
  });

  it("unarchives with isArchived false (queue-shaped body)", async () => {
    const outcome = await applyQuoteArchivePatch(
      async (sql) => {
        assert.match(sql, /SET is_archived = FALSE/);
        return { rows: [{ id: QUOTE_ID }] };
      },
      { quoteId: QUOTE_ID, contractorId: CONTRACTOR_ID, body: { isArchived: false } },
    );
    assert.deepEqual(outcome, { status: 200, json: { archived: false } });
  });
});
