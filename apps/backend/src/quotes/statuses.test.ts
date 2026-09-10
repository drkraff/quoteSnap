import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TRADE_TEMPLATES } from "../data/trade-templates.js";
import {
  CLIENT_QUOTE_STATUSES,
  QUOTE_STATUSES,
  isClientQuoteStatus,
  isQuoteStatus,
} from "./statuses.js";

const MIGRATION_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../db/migrations/007_money_status_checks.sql",
);

function loadMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("QUOTE_STATUSES / isQuoteStatus", () => {
  it("includes HIST-01 names used in code, including ai_failed and Phase 6 reserved", () => {
    assert.deepEqual([...QUOTE_STATUSES], [
      "ai_processing",
      "ai_failed",
      "draft_local",
      "draft_queued",
      "sent",
      "approved",
      "declined",
      "expired",
      "failed_send",
    ]);
  });

  it("accepts every HIST-01 status and rejects unknown strings", () => {
    for (const status of QUOTE_STATUSES) {
      assert.equal(isQuoteStatus(status), true, status);
    }
    assert.equal(isQuoteStatus("processing"), false);
    assert.equal(isQuoteStatus("failed"), false);
    assert.equal(isQuoteStatus(""), false);
  });

  it("keeps client writes a subset of the DB allow-list (A-06)", () => {
    assert.deepEqual([...CLIENT_QUOTE_STATUSES], ["draft_local", "draft_queued"]);
    for (const status of CLIENT_QUOTE_STATUSES) {
      assert.equal(isQuoteStatus(status), true);
      assert.equal(isClientQuoteStatus(status), true);
    }
    for (const status of QUOTE_STATUSES) {
      if (status === "draft_local" || status === "draft_queued") continue;
      assert.equal(isClientQuoteStatus(status), false, status);
    }
  });
});

describe("007_money_status_checks.sql", () => {
  it("adds the money, quantity, and status CHECKs aligned with A-06 parsers", () => {
    const sql = loadMigration();

    assert.match(sql, /CONSTRAINT catalog_items_unit_price_cents_positive/);
    assert.match(sql, /CHECK \(unit_price_cents > 0\)/);

    assert.match(sql, /CONSTRAINT quotes_total_cents_nonnegative/);
    assert.match(sql, /CHECK \(total_cents >= 0\)/);

    assert.match(sql, /CONSTRAINT quote_line_items_quantity_positive/);
    assert.match(sql, /CHECK \(quantity >= 1\)/);

    assert.match(sql, /CONSTRAINT quote_line_items_unit_price_cents_nonnegative/);
    assert.match(sql, /CHECK \(unit_price_cents >= 0\)/);

    assert.match(sql, /CONSTRAINT quotes_status_allowed/);
    for (const status of QUOTE_STATUSES) {
      assert.match(
        sql,
        new RegExp(`'${status}'`),
        `migration must allow status ${status}`,
      );
    }

    assert.match(sql, /COMMENT ON COLUMN catalog_items\.server_id IS/);
    assert.match(sql, /WatermelonDB catalog_items\.server_id/);
  });

  it("repairs out-of-range rows before ADD CONSTRAINT so existing data can migrate", () => {
    const sql = loadMigration();
    const alterAt = sql.search(/^ALTER TABLE /m);
    assert.ok(alterAt > 0);

    const preamble = sql.slice(0, alterAt);
    assert.match(preamble, /UPDATE catalog_items/);
    assert.match(preamble, /UPDATE quotes[\s\S]*total_cents = 0/);
    assert.match(preamble, /UPDATE quote_line_items[\s\S]*quantity = 1/);
    assert.match(preamble, /SET status = 'draft_local'/);
  });
});

describe("TRADE_TEMPLATES money", () => {
  it("seeds catalog prices as integers > 0 so 007 CHECK is satisfied", () => {
    for (const items of Object.values(TRADE_TEMPLATES)) {
      for (const item of items) {
        assert.equal(
          Number.isInteger(item.unitPriceCents) && item.unitPriceCents > 0,
          true,
          `${item.name} unitPriceCents=${item.unitPriceCents}`,
        );
      }
    }
  });
});
