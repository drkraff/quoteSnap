import { quotesEmptyCopy, QUOTES_EMPTY_BODY, QUOTES_EMPTY_HEADING } from './empty-copy';

function assertHonestEmptyCopy(copy: { heading: string; body: string }): void {
  const text = `${copy.heading} ${copy.body}`;
  expect(text).not.toMatch(/\$/);
  expect(text).not.toMatch(/\d+\.\d{2}/);
  expect(text.toLowerCase()).not.toContain('phone');
  expect(text).not.toMatch(/\+1/);
  expect(text).not.toMatch(/555/);
  expect(copy.heading).not.toMatch(/items/i);
  expect(copy.body).not.toMatch(/Add Item/i);
  expect(copy.body).not.toMatch(/Add your first item/i);
}

describe('quotes empty copy (A-19)', () => {
  it('uses quote history language, not catalog Add Item copy', () => {
    expect(QUOTES_EMPTY_HEADING).toBe('No quotes yet');
    expect(QUOTES_EMPTY_BODY).toBe(
      'Record a voice quote or create a manual quote to get started',
    );
    expect(quotesEmptyCopy('active')).toEqual({
      heading: QUOTES_EMPTY_HEADING,
      body: QUOTES_EMPTY_BODY,
    });
    assertHonestEmptyCopy(quotesEmptyCopy('active'));
  });

  it('uses calm Archived copy and never invents a quote, price, or phone', () => {
    const archived = quotesEmptyCopy('archived');
    expect(archived.heading).toBe('No archived quotes');
    expect(archived.body.toLowerCase()).toContain('unarchive');
    expect(archived.body.toLowerCase()).not.toContain('delete');
    assertHonestEmptyCopy(archived);
  });
});
