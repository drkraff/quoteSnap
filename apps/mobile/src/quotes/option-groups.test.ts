import {
  ADD_ALTERNATE_LABEL,
  isOptionRole,
  lineContributesToTotal,
  newOptionGroupId,
  parseOptionGroupId,
  parseOptionRole,
} from './option-groups';

describe('option groups (thin base + alternate)', () => {
  it('accepts only base|alt and treats selected as not-alt', () => {
    expect(isOptionRole('base')).toBe(true);
    expect(isOptionRole('alt')).toBe(true);
    expect(isOptionRole('best')).toBe(false);
    expect(parseOptionRole('alt')).toBe('alt');
    expect(parseOptionRole('guessed')).toBeUndefined();
    expect(lineContributesToTotal({})).toBe(true);
    expect(lineContributesToTotal({ optionRole: 'base' })).toBe(true);
    expect(lineContributesToTotal({ optionRole: 'alt' })).toBe(false);
  });

  it('parses a UUID group id and ignores junk', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(parseOptionGroupId(id)).toBe(id);
    expect(parseOptionGroupId('not-a-uuid')).toBeUndefined();
    expect(parseOptionGroupId(null)).toBeUndefined();
  });

  it('mints a UUID for a new pair', () => {
    const id = newOptionGroupId();
    expect(parseOptionGroupId(id)).toBe(id);
    expect(id).not.toBe(newOptionGroupId());
  });

  it('exposes draft copy for the pair, not a package tier', () => {
    expect(ADD_ALTERNATE_LABEL).toBe('Add alternate');
  });
});
