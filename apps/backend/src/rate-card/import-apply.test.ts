import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { importOldQuotes, importResultMessage, IMPORT_PASTE_HINT } from "./import-apply.js";
import {
  INSERT_RATE_CARD_SQL,
  SELECT_RATE_CARD_BY_KEY_SQL,
  UPDATE_RATE_CARD_SQL,
  type RateCardQueryFn,
  type RateCardRow,
} from "./upsert.js";

const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RECORDED_AT = "2026-09-15T02:00:00.000Z";
const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/old-quote.txt",
);

function mockDb(): RateCardQueryFn {
  const stored = new Map<string, RateCardRow>();
  const queryFn: RateCardQueryFn = async (sql, params) => {
    if (sql === SELECT_RATE_CARD_BY_KEY_SQL) {
      const key = `${params?.[0]}|${params?.[1]}|${params?.[2]}|${params?.[3]}`;
      const row = stored.get(key);
      return { rows: row ? [row] : [] };
    }
    if (sql === INSERT_RATE_CARD_SQL) {
      const row: RateCardRow = {
        id: `id-${stored.size + 1}`,
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
      };
      stored.set(
        `${row.contractor_id}|${row.normalized_name}|${row.unit}|${row.trade_key}`,
        row,
      );
      return { rows: [row] };
    }
    if (sql === UPDATE_RATE_CARD_SQL) {
      return { rows: [] };
    }
    throw new Error(`unexpected sql: ${sql}`);
  };
  return queryFn;
}

describe("importOldQuotes", () => {
  it("upserts fixture lines with source=imported and does not invent totals", async () => {
    const fixture = readFileSync(FIXTURE_PATH, "utf8");
    const outcome = await importOldQuotes(mockDb(), {
      contractorId: CONTRACTOR_ID,
      recordedAtIso: RECORDED_AT,
      body: { text: fixture, trade: "plumbing" },
    });
    assert.equal(outcome.status, 200);
    if (outcome.status !== 200) return;
    assert.equal(outcome.json.imported, 6);
    assert.ok(outcome.json.imported > 0);
    for (const entry of outcome.json.entries) {
      assert.equal(entry.source, "imported");
      assert.ok(entry.unitPriceCents > 0);
    }
    assert.equal(
      outcome.json.entries.some((entry) => entry.unitPriceCents === 219750),
      false,
    );
    assert.equal(
      outcome.json.entries.some((entry) => entry.normalizedName === "copper pipe"),
      true,
    );
    assert.match(outcome.json.message, /Added 6 prices/);
    assert.match(outcome.json.message, /Laminate cabinets 14 lin ft \(no price\)/);
    assert.equal(
      outcome.json.skippedLines.some((line) => line.raw.includes("Laminate cabinets")),
      true,
    );
    assert.equal(
      outcome.json.entries.some((entry) => /laminate/i.test(entry.displayName)),
      false,
    );
  });

  it("stays 200 and calm when images cannot be read yet", async () => {
    const outcome = await importOldQuotes(mockDb(), {
      contractorId: CONTRACTOR_ID,
      body: {
        documents: [{ filename: "scan.jpg", mime: "image/jpeg" }],
      },
    });
    assert.equal(outcome.status, 200);
    if (outcome.status !== 200) return;
    assert.equal(outcome.json.imported, 0);
    assert.deepEqual(outcome.json.unreadableFiles, [
      { filename: "scan.jpg", reason: "image_ocr_stub" },
    ]);
    assert.equal(outcome.json.message, IMPORT_PASTE_HINT);
    assert.match(outcome.json.message, /not read yet/i);
    assert.equal(/added/i.test(outcome.json.message), false);
  });

  it("stays 200 and invents nothing when paste is empty", async () => {
    const outcome = await importOldQuotes(mockDb(), {
      contractorId: CONTRACTOR_ID,
      body: { text: "   \n  " },
    });
    assert.equal(outcome.status, 200);
    if (outcome.status !== 200) return;
    assert.equal(outcome.json.imported, 0);
    assert.deepEqual(outcome.json.entries, []);
    assert.deepEqual(outcome.json.skippedLines, []);
    assert.match(outcome.json.message, /skip/i);
    assert.match(outcome.json.message, /not invent/i);
  });

  it("lists skipped lines on a partial paste without inventing dollars", async () => {
    const outcome = await importOldQuotes(mockDb(), {
      contractorId: CONTRACTOR_ID,
      recordedAtIso: RECORDED_AT,
      body: {
        text: "Replace outlet    each    $85\nLaminate cabinets    14 lin ft\nMystery line with no price\n",
      },
    });
    assert.equal(outcome.status, 200);
    if (outcome.status !== 200) return;
    assert.equal(outcome.json.imported, 1);
    assert.equal(outcome.json.entries[0]?.displayName, "Replace outlet");
    assert.equal(outcome.json.entries[0]?.unitPriceCents, 8500);
    assert.equal(
      outcome.json.entries.some((entry) => /laminate|mystery/i.test(entry.displayName)),
      false,
    );
    assert.match(outcome.json.message, /Laminate cabinets 14 lin ft \(no price\)/);
    assert.match(outcome.json.message, /Mystery line with no price \(no price\)/);
    assert.equal(/\$0/.test(outcome.json.message), false);
  });

  it("imports text documents and still reports unread image slots", async () => {
    const outcome = await importOldQuotes(mockDb(), {
      contractorId: CONTRACTOR_ID,
      recordedAtIso: RECORDED_AT,
      body: {
        trade: "electrical",
        documents: [
          {
            filename: "typed.txt",
            mime: "text/plain",
            text: "Replace outlet    each    $85\n",
          },
          { filename: "photo.png", mime: "image/png" },
        ],
      },
    });
    assert.equal(outcome.status, 200);
    if (outcome.status !== 200) return;
    assert.equal(outcome.json.imported, 1);
    assert.equal(outcome.json.entries[0]?.source, "imported");
    assert.equal(outcome.json.unreadableFiles[0]?.reason, "image_ocr_stub");
    assert.match(outcome.json.message, /Paste priced lines/);
    assert.match(outcome.json.message, /not from photos/);
    assert.equal(/scanned/i.test(outcome.json.message), false);
  });
});

describe("importResultMessage", () => {
  it("never frames empty parse as a hard failure", () => {
    assert.match(importResultMessage({ imported: 0, skipped: 0, unreadableFiles: [] }), /skip/i);
    assert.match(
      importResultMessage({ imported: 0, skipped: 2, unreadableFiles: [] }),
      /quote with blanks/i,
    );
  });

  it("names skipped item lines without inventing a dollar amount", () => {
    const message = importResultMessage({
      imported: 1,
      skipped: 1,
      unreadableFiles: [],
      skippedLines: [{ raw: "Laminate cabinets    14 lin ft", reason: "no_price" }],
    });
    assert.match(message, /Added 1 price/);
    assert.match(message, /Laminate cabinets 14 lin ft \(no price\)/);
    assert.equal(/\$12|\$0/.test(message), false);
  });
});
