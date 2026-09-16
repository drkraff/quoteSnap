import { readFileSync } from 'fs';
import path from 'path';
import {
  importedLinesToUpsertBodies,
  parseImportedQuoteText,
  skippedLinesForDisplay,
} from './import-parse';

const fixture = readFileSync(
  path.join(__dirname, 'fixtures/old-quote.txt'),
  'utf8',
);

describe('parseImportedQuoteText', () => {
  it('extracts literal name+unit+price from fixture text and skips totals/blanks', () => {
    const parsed = parseImportedQuoteText(fixture);
    const byName = Object.fromEntries(parsed.lines.map((line) => [line.name, line]));

    expect(byName['Replace standard outlet']).toEqual({
      name: 'Replace standard outlet',
      unit: 'each',
      unitPriceCents: 8500,
    });
    expect(byName['Replace outlet + back box']).toEqual({
      name: 'Replace outlet + back box',
      unit: 'each',
      unitPriceCents: 14500,
    });
    expect(byName['Copper pipe']).toEqual({
      name: 'Copper pipe',
      unit: 'foot',
      unitPriceCents: 1250,
    });
    expect(byName['Kitchen tear-out + haul-away']).toEqual({
      name: 'Kitchen tear-out + haul-away',
      unit: 'job',
      unitPriceCents: 180000,
    });
    expect(byName['extra outlets']).toEqual({
      name: 'extra outlets',
      unit: 'each',
      unitPriceCents: 8500,
    });
    expect(byName['Labor']?.unit).toBe('hour');
    expect(byName['Labor']?.unitPriceCents).toBe(15000);

    expect(parsed.lines.some((line) => line.name.toLowerCase().includes('laminate'))).toBe(false);
    expect(parsed.lines.some((line) => line.name.toLowerCase().includes('mystery'))).toBe(false);
    expect(parsed.lines.some((line) => line.name.toLowerCase() === 'subtotal')).toBe(false);
    expect(parsed.lines.some((line) => line.unitPriceCents === 219750)).toBe(false);
    expect(parsed.lines.some((line) => line.unitPriceCents === 30000)).toBe(false);
  });

  it('does not invent a labor unit price from hours when the document has no /h rate', () => {
    const parsed = parseImportedQuoteText('Labor 2 hours $300\n');
    expect(parsed.lines).toEqual([]);
    expect(parsed.skipped[0]?.reason).toBe('ambiguous_total');
  });

  it('does not invent a price when the line has qty+unit but no money', () => {
    const parsed = parseImportedQuoteText('Laminate cabinets    14 lin ft\n');
    expect(parsed.lines).toEqual([]);
    expect(parsed.skipped[0]?.reason).toBe('no_price');
  });

  it('returns empty for blank input instead of guessing prices or SKUs', () => {
    expect(parseImportedQuoteText('')).toEqual({ lines: [], skipped: [] });
    expect(parseImportedQuoteText('   \n\n  ')).toEqual({ lines: [], skipped: [] });
    expect(parseImportedQuoteText(null)).toEqual({ lines: [], skipped: [] });
  });

  it('keeps partial paste failures as skipped lines without inventing dollars', () => {
    const parsed = parseImportedQuoteText(
      'Replace outlet    each    $85\nLaminate cabinets    14 lin ft\nMystery line with no price\n',
    );
    expect(parsed.lines).toEqual([
      { name: 'Replace outlet', unit: 'each', unitPriceCents: 8500 },
    ]);
    expect(parsed.skipped.map((line) => line.raw)).toEqual([
      'Laminate cabinets    14 lin ft',
      'Mystery line with no price',
    ]);
    expect(parsed.skipped.every((line) => !('unitPriceCents' in line))).toBe(true);
    expect(parsed.lines.some((line) => line.name.toLowerCase().includes('laminate'))).toBe(
      false,
    );
    expect(parsed.lines.some((line) => line.name.toLowerCase().includes('mystery'))).toBe(
      false,
    );
  });

  it('lists item-like skipped lines for display and omits headers', () => {
    const parsed = parseImportedQuoteText(
      'Quote #1042\nReplace outlet    each    $85\nLaminate cabinets    14 lin ft\n',
    );
    expect(skippedLinesForDisplay(parsed.skipped)).toEqual([
      { raw: 'Laminate cabinets    14 lin ft', reason: 'no_price' },
    ]);
  });

  it('maps @ and /h as unit prices, not line totals', () => {
    const parsed = parseImportedQuoteText(
      '3 extra outlets  @ $85\nLabor 2 hours $150/h\n',
    );
    expect(parsed.lines).toEqual([
      { name: 'extra outlets', unit: 'each', unitPriceCents: 8500 },
      { name: 'Labor', unit: 'hour', unitPriceCents: 15000 },
    ]);
  });

  it('does not invent unit=each when an @ price already has foot or hour', () => {
    const parsed = parseImportedQuoteText(
      'Copper pipe 14 ft @ $12.50\nLabor 2 hours @ $75\nLaminate cabinets 14 lin ft @ $185\n',
    );
    expect(parsed.lines).toEqual([
      { name: 'Copper pipe', unit: 'foot', unitPriceCents: 1250 },
      { name: 'Labor', unit: 'hour', unitPriceCents: 7500 },
      { name: 'Laminate cabinets', unit: 'foot', unitPriceCents: 18500 },
    ]);
    expect(
      parsed.lines.some((line) => line.name === 'Copper pipe' && line.unit === 'each'),
    ).toBe(false);
  });

  it('defaults missing unit to each only when an item + dollar price are clear', () => {
    expect(parseImportedQuoteText('Replace outlet    $85\n').lines).toEqual([
      { name: 'Replace outlet', unit: 'each', unitPriceCents: 8500 },
    ]);
  });
});

describe('importedLinesToUpsertBodies', () => {
  it('maps parser output onto POST /rate-card bodies with source=imported', () => {
    expect(
      importedLinesToUpsertBodies(
        [{ name: 'Copper pipe', unit: 'foot', unitPriceCents: 1250 }],
        'plumbing',
      ),
    ).toEqual([
      {
        name: 'Copper pipe',
        unit: 'foot',
        unitPriceCents: 1250,
        source: 'imported',
        trade: 'plumbing',
      },
    ]);
  });
});
