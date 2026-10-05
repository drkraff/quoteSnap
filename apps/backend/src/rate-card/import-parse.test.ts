import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  importedLinesToUpsertBodies,
  parseImportedQuoteText,
  skippedLinesForDisplay,
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

  it("keeps partial paste failures as skipped lines without inventing dollars", () => {
    const parsed = parseImportedQuoteText(
      "Replace outlet    each    $85\nLaminate cabinets    14 lin ft\nMystery line with no price\n",
    );
    assert.deepEqual(parsed.lines, [
      { name: "Replace outlet", unit: "each", unitPriceCents: 8500 },
    ]);
    assert.deepEqual(
      parsed.skipped.map((line) => line.raw),
      ["Laminate cabinets    14 lin ft", "Mystery line with no price"],
    );
    assert.equal(
      parsed.skipped.every((line) => !("unitPriceCents" in line)),
      true,
    );
  });

  it("lists item-like skipped lines for display and omits headers", () => {
    const parsed = parseImportedQuoteText(
      "Quote #1042\nReplace outlet    each    $85\nLaminate cabinets    14 lin ft\n",
    );
    assert.deepEqual(skippedLinesForDisplay(parsed.skipped), [
      { raw: "Laminate cabinets    14 lin ft", reason: "no_price" },
    ]);
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

  it("does not invent unit=each when an @ price already has foot or hour", () => {
    const parsed = parseImportedQuoteText(
      "Copper pipe 14 ft @ $12.50\nLabor 2 hours @ $75\nLaminate cabinets 14 lin ft @ $185\n",
    );
    assert.deepEqual(parsed.lines, [
      { name: "Copper pipe", unit: "foot", unitPriceCents: 1250 },
      { name: "Labor", unit: "hour", unitPriceCents: 7500 },
      { name: "Laminate cabinets", unit: "foot", unitPriceCents: 18500 },
    ]);
    assert.equal(
      parsed.lines.some((line) => line.name === "Copper pipe" && line.unit === "each"),
      false,
    );
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

  it("keeps an uncomma'd dollar amount instead of a shorter prefix", () => {
    const parsed = parseImportedQuoteText(
      "Copper pipe @ $1234567.89\nPanel $1234.56\nCafé valve @ $12.50\n",
    );
    const byName = Object.fromEntries(parsed.lines.map((line) => [line.name, line]));
    assert.equal(byName["Copper pipe"]?.unitPriceCents, 123456789);
    assert.equal(byName["Panel"]?.unitPriceCents, 123456);
    assert.equal(byName["Café valve"]?.unitPriceCents, 1250);
    assert.equal(parsed.lines.some((line) => line.unitPriceCents === 12300), false);
    assert.equal(parsed.lines.some((line) => line.unitPriceCents === 123456), true);
    assert.notEqual(byName["Café valve"]?.name, "Cafe valve");
  });

  it("does not learn zero, negative, over-max, or a truncated prefix", () => {
    const parsed = parseImportedQuoteText(
      "Zero @ $0.00\nHuge @ $30000000.00\nWidget 123456789.12\nExtra $12.567\n",
    );
    assert.equal(parsed.lines.length, 0);
    assert.equal(parsed.lines.some((line) => line.unitPriceCents === 0), false);
    assert.equal(parsed.lines.some((line) => line.unitPriceCents < 0), false);
    assert.equal(parsed.lines.some((line) => line.unitPriceCents === 300), false);
    assert.equal(parsed.lines.some((line) => line.unitPriceCents === 1200), false);
  });

  it("keeps the largest storable cent and still reads comma amounts", () => {
    const parsed = parseImportedQuoteText(
      "Max item @ $21474836.47\nComma $1,234.56\n",
    );
    const byName = Object.fromEntries(parsed.lines.map((line) => [line.name, line]));
    assert.equal(byName["Max item"]?.unitPriceCents, 2147483647);
    assert.equal(byName["Comma"]?.unitPriceCents, 123456);
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
