import {
  ADD_ALTERNATE_LABEL,
  OPTION_ALTERNATE_LABEL,
  OPTION_IN_TOTAL_LABEL,
  OPTION_SELECTED_HINT,
  OPTION_SWITCH_HINT,
  OPTION_USE_FOR_TOTAL_LABEL,
  canSelectOptionForTotal,
  isOptionRole,
  lineAmountCents,
  lineContributesToTotal,
  listOptionGroups,
  newOptionGroupId,
  optionBadgeLabel,
  optionGroupMembers,
  optionLineChrome,
  optionPartner,
  parseOptionGroupId,
  parseOptionRole,
  sanitizeOptionGroups,
  selectOptionForTotal,
  selectedOptionTotalCents,
} from './option-groups';

const GROUP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function pair(overrides: {
  baseCents?: number | null;
  altCents?: number | null;
  baseRole?: 'base' | 'alt';
  altRole?: 'base' | 'alt';
} = {}) {
  return [
    {
      name: 'Walk-in shower',
      quantity: 1,
      unitPriceCents: overrides.baseCents === undefined ? 180000 : overrides.baseCents,
      optionGroupId: GROUP,
      optionRole: overrides.baseRole ?? ('base' as const),
    },
    {
      name: 'Keep the tub',
      quantity: 1,
      unitPriceCents: overrides.altCents === undefined ? 45000 : overrides.altCents,
      optionGroupId: GROUP,
      optionRole: overrides.altRole ?? ('alt' as const),
    },
  ];
}

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
    expect(OPTION_IN_TOTAL_LABEL).toBe('In total');
    expect(OPTION_ALTERNATE_LABEL).toBe('Alternate');
    expect(OPTION_USE_FOR_TOTAL_LABEL).toBe('Use for total');
    expect(OPTION_SELECTED_HINT.length).toBeGreaterThan(0);
    expect(OPTION_SWITCH_HINT.length).toBeGreaterThan(0);
    expect(optionBadgeLabel('base')).toBe(OPTION_IN_TOTAL_LABEL);
    expect(optionBadgeLabel('alt')).toBe(OPTION_ALTERNATE_LABEL);
    expect(optionBadgeLabel(null)).toBeNull();
  });
});

describe('empty groups do not crash', () => {
  it('returns empty members / groups / partner for no lines', () => {
    expect(optionGroupMembers([], GROUP)).toEqual([]);
    expect(optionGroupMembers(null, GROUP)).toEqual([]);
    expect(optionGroupMembers(undefined, GROUP)).toEqual([]);
    expect(listOptionGroups([])).toEqual([]);
    expect(listOptionGroups(null)).toEqual([]);
    expect(optionPartner([], 0)).toBeNull();
    expect(optionPartner(pair(), 99)).toBeNull();
    expect(sanitizeOptionGroups([])).toEqual([]);
    expect(sanitizeOptionGroups(null)).toEqual([]);
  });

  it('chrome for an empty list or missing index is none — no partner lookup', () => {
    expect(optionLineChrome([], 0)).toMatchObject({
      kind: 'none',
      showSelect: false,
      badge: null,
    });
    expect(optionLineChrome(pair(), 5).kind).toBe('none');
    expect(canSelectOptionForTotal([], 0)).toBe(false);
    expect(canSelectOptionForTotal(pair(), 99)).toBe(false);
  });

  it('treats a one-line leftover group as unpaired (Add alternate), not a pair', () => {
    const orphan = [
      {
        name: 'Walk-in shower',
        quantity: 1,
        unitPriceCents: 180000,
        optionGroupId: GROUP,
        optionRole: 'alt' as const,
      },
    ];
    expect(optionGroupMembers(orphan, GROUP)).toHaveLength(1);
    expect(optionPartner(orphan, 0)).toBeNull();
    expect(optionLineChrome(orphan, 0)).toMatchObject({
      kind: 'add',
      showSelect: false,
      addLabel: ADD_ALTERNATE_LABEL,
    });
    expect(canSelectOptionForTotal(orphan, 0)).toBe(false);
    const dissolved = sanitizeOptionGroups(orphan);
    expect(dissolved[0]!.optionGroupId).toBeUndefined();
    expect(dissolved[0]!.optionRole).toBeUndefined();
    expect(dissolved[0]!.unitPriceCents).toBe(180000);
  });
});

describe('switch selection', () => {
  it('swaps base/alt on Use for total and is a no-op on empty or already-base', () => {
    const items = pair();
    const empty = selectOptionForTotal([], 0);
    expect(empty).toEqual([]);
    expect(selectOptionForTotal(items, 99)).toBe(items);
    expect(selectOptionForTotal(items, 0)).toBe(items);

    const switched = selectOptionForTotal(items, 1);
    expect(switched[0]!.optionRole).toBe('alt');
    expect(switched[1]!.optionRole).toBe('base');
    expect(switched[0]!.unitPriceCents).toBe(180000);
    expect(switched[1]!.unitPriceCents).toBe(45000);
    expect(switched[0]!.name).toBe('Walk-in shower');
  });

  it('does not invent a partner or a price when switching an incomplete group', () => {
    const orphan = [
      {
        name: 'Keep the tub',
        quantity: 1,
        unitPriceCents: null,
        optionGroupId: GROUP,
        optionRole: 'alt' as const,
      },
    ];
    const next = selectOptionForTotal(orphan, 0);
    expect(next).toHaveLength(1);
    expect(next[0]!.unitPriceCents).toBeNull();
    expect(next[0]!.optionGroupId).toBeUndefined();
    expect(next[0]!.optionRole).toBeUndefined();
  });

  it('chrome lets you pick the alternate without a third package tier', () => {
    const items = pair();
    const base = optionLineChrome(items, 0);
    expect(base).toMatchObject({
      kind: 'pair',
      badge: OPTION_IN_TOTAL_LABEL,
      showSelect: false,
      selectedHint: OPTION_SELECTED_HINT,
    });
    expect(base.accessibilityLabel).toContain(OPTION_IN_TOTAL_LABEL);
    const alt = optionLineChrome(items, 1);
    expect(alt).toMatchObject({
      kind: 'pair',
      badge: OPTION_ALTERNATE_LABEL,
      showSelect: true,
      selectLabel: OPTION_USE_FOR_TOTAL_LABEL,
    });
    expect(alt.accessibilityLabel).toContain(OPTION_USE_FOR_TOTAL_LABEL);
    expect(canSelectOptionForTotal(items, 1)).toBe(true);
    expect(canSelectOptionForTotal(items, 0)).toBe(false);
    expect(optionPartner(items, 0)?.item.name).toBe('Keep the tub');
  });

  it('promotes a first member when a pair has no base so selection is never empty', () => {
    const bothAlt = pair({ baseRole: 'alt', altRole: 'alt' });
    const sanitized = sanitizeOptionGroups(bothAlt);
    expect(sanitized[0]!.optionRole).toBe('base');
    expect(sanitized[1]!.optionRole).toBe('alt');
    expect(sanitized[0]!.unitPriceCents).toBe(180000);
    expect(sanitized[1]!.unitPriceCents).toBe(45000);
  });
});

describe('selected-option totals never invent prices', () => {
  it('is 0 for empty groups and blank cents', () => {
    expect(selectedOptionTotalCents([])).toBe(0);
    expect(selectedOptionTotalCents(null)).toBe(0);
    expect(lineAmountCents({ quantity: 1, unitPriceCents: null })).toBe(0);
    expect(lineAmountCents({ quantity: 1, unitPriceCents: 0 })).toBe(0);
    expect(
      selectedOptionTotalCents([
        { name: 'Cabinets', quantity: 14, unitPriceCents: null },
      ]),
    ).toBe(0);
  });

  it('uses only the selected option; switching follows stored cents', () => {
    const items = [
      ...pair(),
      { name: 'Vanity', quantity: 1, unitPriceCents: 80000 },
    ];
    expect(selectedOptionTotalCents(items)).toBe(260000);
    const switched = selectOptionForTotal(items, 1);
    expect(selectedOptionTotalCents(switched)).toBe(125000);
    const blankAlt = pair({ altCents: null });
    expect(selectedOptionTotalCents(blankAlt)).toBe(180000);
    expect(selectedOptionTotalCents(selectOptionForTotal(blankAlt, 1))).toBe(0);
  });

  it('does not add both sides of a pair, including a second group', () => {
    const items = [
      ...pair(),
      {
        name: 'Tile A',
        quantity: 1,
        unitPriceCents: 10000,
        optionGroupId: OTHER,
        optionRole: 'base' as const,
      },
      {
        name: 'Tile B',
        quantity: 1,
        unitPriceCents: 999999,
        optionGroupId: OTHER,
        optionRole: 'alt' as const,
      },
    ];
    expect(selectedOptionTotalCents(items)).toBe(190000);
  });
});
