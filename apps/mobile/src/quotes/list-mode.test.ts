import {
  ARCHIVED_QUOTES_EMPTY_BODY,
  ARCHIVED_QUOTES_EMPTY_HEADING,
  ARCHIVED_QUOTES_HEADER_TITLE,
  QUOTES_LIST_MODE_ACTIVE_LABEL,
  QUOTES_LIST_MODE_ARCHIVED_LABEL,
} from './list-mode';

describe('quotes list mode copy', () => {
  it('labels the Archived toggle without promising hard delete', () => {
    expect(QUOTES_LIST_MODE_ACTIVE_LABEL).toBe('Quotes');
    expect(QUOTES_LIST_MODE_ARCHIVED_LABEL).toBe('Archived');
    expect(ARCHIVED_QUOTES_HEADER_TITLE).toBe('Archived');
    expect(ARCHIVED_QUOTES_EMPTY_HEADING).toBe('No archived quotes');
    expect(ARCHIVED_QUOTES_EMPTY_BODY.toLowerCase()).toContain('unarchive');
    expect(ARCHIVED_QUOTES_EMPTY_BODY.toLowerCase()).not.toContain('delete');
  });
});
