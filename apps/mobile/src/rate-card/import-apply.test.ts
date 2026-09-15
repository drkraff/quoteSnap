import { importedLineQueueItems, previewImportedQuotes } from './import-apply';
import { IMPORT_PASTE_HINT } from './import-apply';

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
  });

  it('stays calm when nothing parseable was pasted', () => {
    const preview = previewImportedQuotes({ text: '' });
    expect(preview.imported).toBe(0);
    expect(preview.message.toLowerCase()).toMatch(/skip/);
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
