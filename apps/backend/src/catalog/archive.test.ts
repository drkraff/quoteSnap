import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCatalogArchivePatch,
  catalogArchiveUpdateSql,
  parseArchivePatchBody,
  planArchivePatch,
} from "./archive.js";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CONTRACTOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("parseArchivePatchBody", () => {
  it("treats a missing body as archive so existing PATCH clients keep working", () => {
    assert.deepEqual(parseArchivePatchBody(undefined), { ok: true, archived: true });
    assert.deepEqual(parseArchivePatchBody(null), { ok: true, archived: true });
    assert.deepEqual(parseArchivePatchBody({}), { ok: true, archived: true });
  });

  it("accepts archived true and false", () => {
    assert.deepEqual(parseArchivePatchBody({ archived: true }), { ok: true, archived: true });
    assert.deepEqual(parseArchivePatchBody({ archived: false }), { ok: true, archived: false });
  });

  it("rejects non-boolean archived values", () => {
    assert.deepEqual(parseArchivePatchBody({ archived: "false" }), {
      ok: false,
      error: "archived must be a boolean",
    });
    assert.deepEqual(parseArchivePatchBody({ archived: 0 }), {
      ok: false,
      error: "archived must be a boolean",
    });
    assert.deepEqual(parseArchivePatchBody([]), {
      ok: false,
      error: "archived must be a boolean",
    });
  });
});

describe("catalogArchiveUpdateSql", () => {
  it("keeps archive one-way: only an active tenant-owned row", () => {
    const sql = catalogArchiveUpdateSql(true);
    assert.match(sql, /SET is_archived = TRUE/);
    assert.match(sql, /contractor_id = \$2/);
    assert.match(sql, /is_archived = FALSE/);
  });

  it("unarchives by tenant without requiring the row to still be archived", () => {
    const sql = catalogArchiveUpdateSql(false);
    assert.match(sql, /SET is_archived = FALSE/);
    assert.match(sql, /contractor_id = \$2/);
    assert.doesNotMatch(sql, /AND is_archived = TRUE/);
    assert.doesNotMatch(sql, /AND is_archived = FALSE/);
  });
});

describe("planArchivePatch", () => {
  it("binds item id then contractor_id for tenant scoping", () => {
    const plan = planArchivePatch(ITEM_ID, CONTRACTOR_ID, { archived: false });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.archived, false);
    assert.deepEqual(plan.params, [ITEM_ID, CONTRACTOR_ID]);
  });

  it("returns 400 without SQL when archived is invalid", () => {
    const plan = planArchivePatch(ITEM_ID, CONTRACTOR_ID, { archived: "nope" });
    assert.deepEqual(plan, {
      ok: false,
      status: 400,
      error: "archived must be a boolean",
    });
  });

  it("scopes the UPDATE to the JWT contractor, not another tenant", () => {
    const own = planArchivePatch(ITEM_ID, CONTRACTOR_ID, { archived: false });
    const other = planArchivePatch(ITEM_ID, OTHER_CONTRACTOR_ID, { archived: false });
    assert.equal(own.ok, true);
    assert.equal(other.ok, true);
    if (!own.ok || !other.ok) return;
    assert.deepEqual(own.params, [ITEM_ID, CONTRACTOR_ID]);
    assert.deepEqual(other.params, [ITEM_ID, OTHER_CONTRACTOR_ID]);
  });
});

describe("applyCatalogArchivePatch", () => {
  it("unarchives a tenant-owned row and returns archived false", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const outcome = await applyCatalogArchivePatch(
      async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [{ id: ITEM_ID }] };
      },
      { itemId: ITEM_ID, contractorId: CONTRACTOR_ID, body: { archived: false } },
    );

    assert.equal(outcome.status, 200);
    assert.deepEqual(outcome.json, { archived: false });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.params, [ITEM_ID, CONTRACTOR_ID]);
    assert.match(calls[0]?.sql ?? "", /SET is_archived = FALSE/);
  });

  it("archives with the existing active-row predicate", async () => {
    const outcome = await applyCatalogArchivePatch(
      async (sql) => {
        assert.match(sql, /SET is_archived = TRUE/);
        assert.match(sql, /AND is_archived = FALSE/);
        return { rows: [{ id: ITEM_ID }] };
      },
      { itemId: ITEM_ID, contractorId: CONTRACTOR_ID, body: { archived: true } },
    );
    assert.deepEqual(outcome, { status: 200, json: { archived: true } });
  });

  it("returns 404 when the tenant-scoped update matches no row", async () => {
    const outcome = await applyCatalogArchivePatch(
      async (_sql, params) => {
        assert.deepEqual(params, [ITEM_ID, CONTRACTOR_ID]);
        return { rows: [] };
      },
      { itemId: ITEM_ID, contractorId: CONTRACTOR_ID, body: { archived: false } },
    );
    assert.deepEqual(outcome, { status: 404, json: { error: "Item not found" } });
  });

  it("does not query on a 400 body", async () => {
    let queried = false;
    const outcome = await applyCatalogArchivePatch(
      async () => {
        queried = true;
        return { rows: [{ id: ITEM_ID }] };
      },
      { itemId: ITEM_ID, contractorId: CONTRACTOR_ID, body: { archived: "false" } },
    );
    assert.equal(queried, false);
    assert.deepEqual(outcome, {
      status: 400,
      json: { error: "archived must be a boolean" },
    });
  });

  it("omitted body still archives (pre-A-05 clients)", async () => {
    const outcome = await applyCatalogArchivePatch(
      async (sql) => {
        assert.match(sql, /SET is_archived = TRUE/);
        return { rows: [{ id: ITEM_ID }] };
      },
      { itemId: ITEM_ID, contractorId: CONTRACTOR_ID, body: undefined },
    );
    assert.deepEqual(outcome, { status: 200, json: { archived: true } });
  });
});
