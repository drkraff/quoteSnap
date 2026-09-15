import {
  IMPORT_EMPTY_BODY,
  IMPORT_EMPTY_HEADING,
  IMPORT_NO_PRICES_BODY,
  IMPORT_OCR_STUB_HEADING,
  IMPORT_OLD_QUOTES_BODY,
  IMPORT_PASTE_HINT,
  IMPORT_PHOTO_HINT,
  formatSkippedImportedLine,
} from './import-copy';

describe('old-quote import copy', () => {
  it('tells contractors to paste because photos are not read', () => {
    expect(IMPORT_OLD_QUOTES_BODY.toLowerCase()).toMatch(/paste/);
    expect(IMPORT_OLD_QUOTES_BODY.toLowerCase()).toMatch(/not read/);
    expect(IMPORT_OLD_QUOTES_BODY.toLowerCase()).toMatch(/picture|photos/);
    expect(IMPORT_PHOTO_HINT.toLowerCase()).toMatch(/paste/);
    expect(IMPORT_PHOTO_HINT.toLowerCase()).toMatch(/not read/);
    expect(IMPORT_PASTE_HINT.toLowerCase()).toMatch(/paste priced lines/);
    expect(IMPORT_OCR_STUB_HEADING.toLowerCase()).toMatch(/not read/);
  });

  it('does not claim OCR or photo-scan success', () => {
    const copy = [
      IMPORT_OLD_QUOTES_BODY,
      IMPORT_PHOTO_HINT,
      IMPORT_PASTE_HINT,
      IMPORT_EMPTY_BODY,
    ].join(' ');
    expect(copy.toLowerCase()).not.toMatch(/scanned/);
    expect(copy.toLowerCase()).not.toMatch(/we read/);
    expect(copy.toLowerCase()).not.toMatch(/extracted from (the )?photo/);
    expect(copy.toLowerCase()).not.toMatch(/ocr success/);
  });

  it('keeps empty paste calm and does not promise invented prices', () => {
    expect(IMPORT_EMPTY_HEADING.toLowerCase()).toMatch(/nothing to import/);
    expect(IMPORT_EMPTY_BODY.toLowerCase()).toMatch(/skip/);
    expect(IMPORT_EMPTY_BODY.toLowerCase()).toMatch(/not invent/);
    expect(IMPORT_NO_PRICES_BODY.toLowerCase()).toMatch(/quote with blanks/);
    expect(IMPORT_NO_PRICES_BODY.toLowerCase()).toMatch(/not invent/);
  });

  it('labels a skipped line from the pasted text, not a guessed dollar amount', () => {
    expect(
      formatSkippedImportedLine({ raw: 'Laminate cabinets    14 lin ft', reason: 'no_price' }),
    ).toBe('Laminate cabinets 14 lin ft (no price)');
    expect(
      formatSkippedImportedLine({ raw: 'Labor 2 hours $300', reason: 'ambiguous_total' }),
    ).toMatch(/looks like a total/);
    expect(
      formatSkippedImportedLine({ raw: 'Labor 2 hours $300', reason: 'ambiguous_total' }),
    ).not.toMatch(/\$150/);
  });
});
