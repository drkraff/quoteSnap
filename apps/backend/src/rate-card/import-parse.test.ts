import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  importedLinesToUpsertBodies,
  parseImportedQuoteText,
} from "./import-parse.js";

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/old-quote.txt",
);

function loadFixture(): string {
  return readFileSync(FIXTURE_PATH, "utf8");
}

describe("parseImportedQuoteText", () => {
  it("extracts literal name+unit+price from fixture text and skips totals/blanks", () => {
    const parsed = parseImportedQuoteText(loadFixture());
    const byName = Object.fromEntries(parsed.lines.map((line) => [line.name, line]));

    assert.deepEqual(byName["Replace standard outlet"], {
      name: "Replace standard outlet",
      unit: "each",
      unitPriceCents: 8500,
    });
    assert.deepEqual(byName["Replace outlet + back box"], {
      name: "Replace outlet + back box",
      unit: "each",
      unitPriceCents: 14500,
    });
    assert.deepEqual(byName["Copper pipe"], {
      name: "Copper pipe",
      unit: "foot",
      unitPriceCents: 1250,
    });
    assert.deepEqual(byName["Kitchen tear-out + haul-away"], {
      name: "Kitchen tear-out + haul-away",
      unit: "job",
      unitPriceCents: 180000,
    });
    assert.deepEqual(byName["extra outlets"], {
      name: "extra outlets",
      unit: "each",
      unitPriceCents: 8500,
    });
    assert.equal(byName["Labor"]?.unit, "hour");
    assert.equal(byName["Labor"]?.unitPriceCents, 15000);

    assert.equal(parsed.lines.some((line) => line.name.toLowerCase().includes("laminate")), false);
    assert.equal(parsed.lines.some((line) => line.name.toLowerCase().includes("mystery")), false);
    assert.equal(parsed.lines.some((line) => line.name.toLowerCase() === "subtotal"), false);
    assert.equal(parsed.lines.some((line) => line.unitPriceCents === 219750), false);
    assert.equal(parsed.lines.some((line) => line.unitPriceCents === 30000), false);
  });

  it("does not invent a labor unit price from hours when the document has no /h rate", () => {
    const parsed = parseImportedQuoteText("Labor 2 hours $300\n");
    assert.deepEqual(parsed.lines, []);
    assert.equal(parsed.skipped[0]?.reason, "ambiguous_total");
  });

  it("does not invent a price when the line has qty+unit but no money", () => {
    const parsed = parseImportedQuoteText("Laminate cabinets    14 lin ft\n");
    assert.deepEqual(parsed.lines, []);
    assert.equal(parsed.skipped[0]?.reason, "no_price");
  });

  it("maps @ and /h as unit prices, not line totals", () => {
    const parsed = parseImportedQuoteText(
      "3 extra outlets  @ $85\nLabor 2 hours $150/h\n",
    );
    assert.deepEqual(parsed.lines, [
      { name: "extra outlets", unit: "each", unitPriceCents: 8500 },
      { name: "Labor", unit: "hour", unitPriceCents: 15000 },
    ]);
  });

  it("defaults missing unit to each only when an item + dollar price are clear", () => {
    const parsed = parseImportedQuoteText("Replace outlet    $85\n");
    assert.deepEqual(parsed.lines, [
      { name: "Replace outlet", unit: "each", unitPriceCents: 8500 },
    ]);
  });

  it("returns empty for blank input instead of guessing", () => {
    assert.deepEqual(parseImportedQuoteText(""), { lines: [], skipped: [] });
    assert.deepEqual(parseImportedQuoteText(null), { lines: [], skipped: [] });
  });
});

describe("importedLinesToUpsertBodies", () => {
  it("maps parser output onto POST /rate-card bodies with source=imported", () => {
    const bodies = importedLinesToUpsertBodies(
      [{ name: "Copper pipe", unit: "foot", unitPriceCents: 1250 }],
      "plumbing",
    );
    assert.deepEqual(bodies, [
      {
        name: "Copper pipe",
        unit: "foot",
        unitPriceCents: 1250,
        source: "imported",
        trade: "plumbing",
      },
    ]);
  });

  it("omits trade rather than inventing one", () => {
    const bodies = importedLinesToUpsertBodies(
      [{ name: "Replace outlet", unit: "each", unitPriceCents: 8500 }],
      null,
    );
    assert.deepEqual(bodies, [
      {
        name: "Replace outlet",
        unit: "each",
        unitPriceCents: 8500,
        source: "imported",
      },
    ]);
  });
});
