import {
  DELETE_RATE_CONFIRM_ACTION,
  DELETE_RATE_CONFIRM_MESSAGE,
  DELETE_RATE_CONFIRM_TITLE,
  MY_RATES_EMPTY_BODY,
  MY_RATES_EMPTY_HEADING,
  MY_RATES_NO_MATCHES,
  MY_RATES_SEARCH_PLACEHOLDER,
  MY_RATES_TITLE,
  MY_RATES_UNIT_ALL_LABEL,
  MY_RATES_UNIT_FILTER_LABEL,
} from './list-copy';

describe('My rates copy', () => {
  it('is a bulk-edit list, not catalog onboarding', () => {
    expect(MY_RATES_TITLE).toBe('My rates');
    expect(MY_RATES_EMPTY_HEADING).toBe('No rates yet');
    expect(MY_RATES_EMPTY_BODY.toLowerCase()).toContain('start quoting');
    expect(MY_RATES_EMPTY_BODY.toLowerCase()).not.toContain('add your first item');
  });

  it('describes substring search and unit filter without inventing prices', () => {
    expect(MY_RATES_SEARCH_PLACEHOLDER).toBe('Search rates');
    expect(MY_RATES_UNIT_FILTER_LABEL).toBe('Unit');
    expect(MY_RATES_UNIT_ALL_LABEL).toBe('All');
    expect(MY_RATES_NO_MATCHES).toBe('No rates match');
    expect(MY_RATES_NO_MATCHES.toLowerCase()).not.toContain('suggested');
    expect(MY_RATES_NO_MATCHES.toLowerCase()).not.toContain('price');
  });

  it('confirms delete without rewriting old quote prices', () => {
    expect(DELETE_RATE_CONFIRM_TITLE).toBe('Remove this rate?');
    expect(DELETE_RATE_CONFIRM_ACTION).toBe('Remove');
    expect(DELETE_RATE_CONFIRM_MESSAGE.toLowerCase()).toContain('old quotes keep their prices');
  });
});
