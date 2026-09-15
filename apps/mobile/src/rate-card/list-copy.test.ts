import {
  MY_RATES_EMPTY_BODY,
  MY_RATES_EMPTY_HEADING,
  MY_RATES_NO_MATCHES,
  MY_RATES_SEARCH_PLACEHOLDER,
  MY_RATES_TITLE,
} from './list-copy';

describe('My rates copy', () => {
  it('is a bulk-edit list, not catalog onboarding', () => {
    expect(MY_RATES_TITLE).toBe('My rates');
    expect(MY_RATES_EMPTY_HEADING).toBe('No rates yet');
    expect(MY_RATES_EMPTY_BODY.toLowerCase()).toContain('start quoting');
    expect(MY_RATES_EMPTY_BODY.toLowerCase()).not.toContain('add your first item');
  });

  it('describes substring search without inventing prices', () => {
    expect(MY_RATES_SEARCH_PLACEHOLDER).toBe('Search rates');
    expect(MY_RATES_NO_MATCHES.toLowerCase()).toContain('match');
    expect(MY_RATES_NO_MATCHES.toLowerCase()).not.toContain('suggested');
    expect(MY_RATES_NO_MATCHES.toLowerCase()).not.toContain('price');
  });
});
