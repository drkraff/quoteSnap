import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LIST_ACTIVE_CATALOG_SQL } from "./list.js";

describe("LIST_ACTIVE_CATALOG_SQL", () => {
  it("lists tenant-scoped actives only — archived rows stay in Postgres", () => {
    assert.match(LIST_ACTIVE_CATALOG_SQL, /FROM catalog_items/);
    assert.match(LIST_ACTIVE_CATALOG_SQL, /contractor_id = \$1/);
    assert.match(LIST_ACTIVE_CATALOG_SQL, /is_archived = FALSE/);
    assert.doesNotMatch(LIST_ACTIVE_CATALOG_SQL, /DELETE /);
    assert.doesNotMatch(LIST_ACTIVE_CATALOG_SQL, /is_archived = TRUE/);
  });

  it("does not invent rows when the contractor has no actives", () => {
    assert.match(LIST_ACTIVE_CATALOG_SQL, /WHERE contractor_id = \$1 AND is_archived = FALSE/);
    assert.doesNotMatch(LIST_ACTIVE_CATALOG_SQL, /INSERT /);
  });
});
