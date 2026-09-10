import { QUOTES_EMPTY_BODY, QUOTES_EMPTY_HEADING } from './empty-copy';

describe('quotes empty copy (A-19)', () => {
  it('uses quote history language, not catalog Add Item copy', () => {
    expect(QUOTES_EMPTY_HEADING).toBe('No quotes yet');
    expect(QUOTES_EMPTY_BODY).toBe(
      'Record a voice quote or create a manual quote to get started',
    );
    expect(QUOTES_EMPTY_HEADING).not.toMatch(/items/i);
    expect(QUOTES_EMPTY_BODY).not.toMatch(/Add Item/i);
    expect(QUOTES_EMPTY_BODY).not.toMatch(/Add your first item/i);
  });
});
