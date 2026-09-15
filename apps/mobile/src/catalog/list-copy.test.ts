import {
  CATALOG_ADD_ITEM_LABEL,
  CATALOG_ARCHIVED_TOAST,
  CATALOG_EMPTY_BODY,
  CATALOG_EMPTY_HEADING,
  CATALOG_IMPORT_OLD_QUOTES_LABEL,
  CATALOG_NO_MATCHES,
  CATALOG_UNDO_ARCHIVE_LABEL,
} from './list-copy';

describe('catalog empty copy', () => {
  it('uses the existing calm empty state, not suggested SKUs or prices', () => {
    expect(CATALOG_EMPTY_HEADING).toBe('No items yet');
    expect(CATALOG_EMPTY_BODY).toBe('Add your first item to get started');
    expect(CATALOG_ADD_ITEM_LABEL).toBe('Add Item');
    expect(CATALOG_IMPORT_OLD_QUOTES_LABEL).toBe('Import old quotes');
    expect(CATALOG_EMPTY_HEADING.toLowerCase()).not.toContain('suggested');
    expect(CATALOG_EMPTY_BODY.toLowerCase()).not.toContain('price');
    expect(CATALOG_EMPTY_BODY.toLowerCase()).not.toMatch(/\$\d/);
  });

  it('describes a filter miss without inventing a replacement item', () => {
    expect(CATALOG_NO_MATCHES).toBe('No items match');
    expect(CATALOG_NO_MATCHES.toLowerCase()).not.toContain('suggested');
    expect(CATALOG_NO_MATCHES.toLowerCase()).not.toContain('price');
  });

  it('undo toast is restore, not a new row', () => {
    expect(CATALOG_ARCHIVED_TOAST).toBe('Item archived.');
    expect(CATALOG_UNDO_ARCHIVE_LABEL).toBe('Undo archive');
    expect(CATALOG_ARCHIVED_TOAST.toLowerCase()).not.toContain('deleted');
  });
});
