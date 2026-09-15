import {
  importFeedbackView,
  importedLineQueueItems,
  IMPORT_PASTE_HINT,
  previewImportedQuotes,
} from './import-apply';
import {
  IMPORT_EMPTY_BODY,
  IMPORT_EMPTY_HEADING,
  IMPORT_NO_PRICES_HEADING,
  IMPORT_OCR_STUB_HEADING,
} from './import-copy';

describe('previewImportedQuotes', () => {
  it('previews pasted lines and marks picked photos as paste-needed', () => {
    const preview = previewImportedQuotes({
      text: 'Replace outlet    each    $85\n',
      trade: 'electrical',
      files: [{ uri: 'file://scan', filename: 'scan.jpg', mime: 'image/jpeg' }],
    });
    expect(preview.imported).toBe(1);
    expect(preview.payloads).toEqual([
      {
        name: 'Replace outlet',
        unit: 'each',
        unitPriceCents: 8500,
        source: 'imported',
        trade: 'electrical',
      },
    ]);
    expect(preview.unreadableFiles).toEqual([
      { filename: 'scan.jpg', reason: 'image_ocr_stub' },
    ]);
    expect(preview.message).toContain(IMPORT_PASTE_HINT);
    expect(preview.message.toLowerCase()).toMatch(/not from photos/);
    expect(preview.message.toLowerCase()).not.toMatch(/scanned/);
  });

  it('stays calm when nothing parseable was pasted', () => {
    const preview = previewImportedQuotes({ text: '' });
    expect(preview.imported).toBe(0);
    expect(preview.payloads).toEqual([]);
    expect(preview.skippedLines).toEqual([]);
    expect(preview.message).toBe(IMPORT_EMPTY_BODY);
    expect(preview.message.toLowerCase()).toMatch(/skip/);
    expect(preview.message.toLowerCase()).toMatch(/not invent/);
  });

  it('does not invent prices when photos are picked without paste', () => {
    const preview = previewImportedQuotes({
      text: '',
      files: [{ uri: 'file://scan', filename: 'scan.jpg', mime: 'image/jpeg' }],
    });
    expect(preview.imported).toBe(0);
    expect(preview.payloads).toEqual([]);
    expect(preview.message).toBe(IMPORT_PASTE_HINT);
    expect(preview.message.toLowerCase()).not.toMatch(/added/);
    expect(preview.message.toLowerCase()).not.toMatch(/scanned/);
    const view = importFeedbackView(preview);
    expect(view.heading).toBe(IMPORT_OCR_STUB_HEADING);
    expect(view.skippedLabels).toEqual([]);
    expect(view.tone).toBe('calm');
  });

  it('lists which partial-paste lines were skipped without inventing dollars', () => {
    const preview = previewImportedQuotes({
      text: 'Replace outlet    each    $85\nLaminate cabinets    14 lin ft\nMystery line with no price\n',
    });
    expect(preview.imported).toBe(1);
    expect(preview.payloads).toEqual([
      {
        name: 'Replace outlet',
        unit: 'each',
        unitPriceCents: 8500,
        source: 'imported',
      },
    ]);
    expect(preview.payloads.some((row) => row.name.toLowerCase().includes('laminate'))).toBe(
      false,
    );
    expect(preview.message).toMatch(/Laminate cabinets 14 lin ft \(no price\)/);
    expect(preview.message).toMatch(/Mystery line with no price \(no price\)/);
    expect(preview.message).not.toMatch(/\$0/);
    const view = importFeedbackView(preview);
    expect(view.tone).toBe('review');
    expect(view.skippedLabels).toEqual([
      'Laminate cabinets 14 lin ft (no price)',
      'Mystery line with no price (no price)',
    ]);
  });

  it('shows a friendly empty block for whitespace-only paste', () => {
    const view = importFeedbackView(previewImportedQuotes({ text: '   \n\t  ' }));
    expect(view.heading).toBe(IMPORT_EMPTY_HEADING);
    expect(view.body).toBe(IMPORT_EMPTY_BODY);
    expect(view.skippedLabels).toEqual([]);
    expect(view.tone).toBe('calm');
  });

  it('shows skipped item lines when paste has no priced rows', () => {
    const view = importFeedbackView(
      previewImportedQuotes({ text: 'Laminate cabinets    14 lin ft\n' }),
    );
    expect(view.heading).toBe(IMPORT_NO_PRICES_HEADING);
    expect(view.body.toLowerCase()).toMatch(/quote with blanks/);
    expect(view.skippedLabels).toEqual(['Laminate cabinets 14 lin ft (no price)']);
    expect(view.tone).toBe('review');
  });
});

describe('importedLineQueueItems', () => {
  it('reuses the rate-card queue entity id and source=imported', () => {
    expect(
      importedLineQueueItems(
        [{ name: 'Copper pipe', unit: 'foot', unitPriceCents: 1250 }],
        'plumbing',
      ),
    ).toEqual([
      {
        entityType: 'rate_card',
        entityId: 'rate-card:copper pipe|foot|plumbing',
        action: 'update',
        payload: {
          name: 'Copper pipe',
          unit: 'foot',
          unitPriceCents: 1250,
          source: 'imported',
          trade: 'plumbing',
        },
      },
    ]);
  });
});
