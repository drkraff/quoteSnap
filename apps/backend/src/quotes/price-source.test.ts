import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inferSnapshotPriceSource,
  parseOptionalPriceSource,
  SNAPSHOT_PRICE_SOURCES,
  snapshotPriceSourceFromRow,
} from "./price-source.js";

const MIGRATION_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../db/migrations/015_quote_line_item_price_source.sql",
);

describe("parseOptionalPriceSource", () => {
  it("treats omitted, null, and empty as preserve", () => {
    assert.deepEqual(parseOptionalPriceSource(undefined), { ok: true, source: undefined });
    assert.deepEqual(parseOptionalPriceSource(null), { ok: true, source: undefined });
    assert.deepEqual(parseOptionalPriceSource(""), { ok: true, source: undefined });
  });

  it("accepts every snapshot allow-list value including attach sources and known", () => {
    for (const source of SNAPSHOT_PRICE_SOURCES) {
      assert.deepEqual(parseOptionalPriceSource(source), { ok: true, source });
    }
  });

  it("rejects invented or guessed source labels", () => {
    assert.equal(parseOptionalPriceSource("guessed").ok, false);
    assert.equal(parseOptionalPriceSource("imported").ok, false);
    assert.equal(parseOptionalPriceSource(1).ok, false);
  });
});

describe("snapshotPriceSourceFromRow", () => {
  it("keeps a stored attach source", () => {
    assert.equal(snapshotPriceSourceFromRow("spoken", 850), "spoken");
    assert.equal(snapshotPriceSourceFromRow("catalog", 17500), "catalog");
    assert.equal(snapshotPriceSourceFromRow("learned", 5200), "learned");
    assert.equal(snapshotPriceSourceFromRow("computed", 7500), "computed");
    assert.equal(snapshotPriceSourceFromRow("unknown", 0), "unknown");
    assert.equal(snapshotPriceSourceFromRow("known", 2500), "known");
  });

  it("infers known vs unknown on pre-migration NULL without inventing a price", () => {
    assert.equal(snapshotPriceSourceFromRow(null, 1500), "known");
    assert.equal(snapshotPriceSourceFromRow(null, 0), "unknown");
    assert.equal(inferSnapshotPriceSource(1), "known");
    assert.equal(inferSnapshotPriceSource(0), "unknown");
  });
});

describe("015_quote_line_item_price_source.sql", () => {
  it("adds a nullable price_source with the snapshot CHECK allow-list", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS price_source VARCHAR\(20\)/);
    assert.match(sql, /CONSTRAINT quote_line_items_price_source_allowed/);
    for (const source of SNAPSHOT_PRICE_SOURCES) {
      assert.match(sql, new RegExp(`'${source}'`));
    }
    assert.match(sql, /Never invent a price/);
  });
});
