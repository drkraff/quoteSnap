import {
  MY_RATES_EMPTY_BODY,
  MY_RATES_EMPTY_HEADING,
  MY_RATES_TITLE,
} from './list-copy';

describe('My rates copy', () => {
  it('is a bulk-edit list, not catalog onboarding', () => {
    expect(MY_RATES_TITLE).toBe('My rates');
    expect(MY_RATES_EMPTY_HEADING).toBe('No rates yet');
    expect(MY_RATES_EMPTY_BODY.toLowerCase()).toContain('start quoting');
    expect(MY_RATES_EMPTY_BODY.toLowerCase()).not.toContain('add your first item');
  });
});
