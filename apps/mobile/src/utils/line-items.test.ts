import {
  parseLineItems,
  addItem,
  removeItem,
  updateQuantity,
  updatePrice,
  updatePrivateNote,
  recalculateTotal,
  formatQuantityLabel,
  formatUnitPriceLabel,
  isUnknownUnitPrice,
  serializeLineItems,
  addAlternate,
  selectOptionForTotal,
  type LineItem,
} from './line-items';

describe('parseLineItems', () => {
  it('returns empty array for empty JSON array string', () => {
    expect(parseLineItems('[]')).toEqual([]);
  });

  it('returns array with items from valid JSON', () => {
    const item = { catalogItemId: 'a', name: 'Test', quantity: 2, unitPriceCents: 1000 };
    const result = parseLineItems(JSON.stringify([item]));
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(item);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseLineItems('not json')).toEqual([]);
  });

  it('returns empty array for non-array JSON', () => {
    expect(parseLineItems('{"key":"value"}')).toEqual([]);
  });
});

describe('addItem', () => {
  it('adds a new item with quantity 1 and provided price', () => {
    const result = addItem([], { id: 'cat-1', name: 'Pipe', unitPriceCents: 500 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      catalogItemId: 'cat-1',
      name: 'Pipe',
      quantity: 1,
      unitPriceCents: 500,
      priceSource: 'catalog',
    });
  });

  it('appends item to existing list', () => {
    const existing: LineItem[] = [
      { catalogItemId: 'a', name: 'Existing', quantity: 2, unitPriceCents: 1000 },
    ];
    const result = addItem(existing, { id: 'b', name: 'New', unitPriceCents: 750 });
    expect(result).toHaveLength(2);
    expect(result[1].catalogItemId).toBe('b');
  });
});

describe('removeItem', () => {
  it('removes item at given index', () => {
    const items: LineItem[] = [
      { catalogItemId: 'a', name: 'Item A', quantity: 1, unitPriceCents: 100 },
      { catalogItemId: 'b', name: 'Item B', quantity: 1, unitPriceCents: 200 },
    ];
    const result = removeItem(items, 0);
    expect(result).toHaveLength(1);
    expect(result[0].catalogItemId).toBe('b');
  });

  it('returns unchanged array for out-of-range index', () => {
    const items: LineItem[] = [
      { catalogItemId: 'a', name: 'Item A', quantity: 1, unitPriceCents: 100 },
    ];
    expect(removeItem(items, 5)).toHaveLength(1);
  });
});

describe('updateQuantity', () => {
  it('increases quantity by delta', () => {
    const items: LineItem[] = [
      { catalogItemId: 'a', name: 'Item', quantity: 2, unitPriceCents: 1000 },
    ];
    const result = updateQuantity(items, 0, 1);
    expect(result[0].quantity).toBe(3);
  });

  it('does not decrease quantity below 1', () => {
    const items: LineItem[] = [
      { catalogItemId: 'a', name: 'Item', quantity: 1, unitPriceCents: 1000 },
    ];
    const result = updateQuantity(items, 0, -1);
    expect(result[0].quantity).toBe(1);
  });

  it('does not modify other items', () => {
    const items: LineItem[] = [
      { catalogItemId: 'a', name: 'A', quantity: 2, unitPriceCents: 100 },
      { catalogItemId: 'b', name: 'B', quantity: 3, unitPriceCents: 200 },
    ];
    const result = updateQuantity(items, 0, 1);
    expect(result[1].quantity).toBe(3);
  });
});

describe('updatePrice', () => {
  it('updates unit price at given index', () => {
    const items: LineItem[] = [
      { catalogItemId: 'a', name: 'Item', quantity: 1, unitPriceCents: 1000 },
    ];
    const result = updatePrice(items, 0, 2500);
    expect(result[0].unitPriceCents).toBe(2500);
    expect(result[0].priceSource).toBe('known');
  });

  it('does not modify other items', () => {
    const items: LineItem[] = [
      { catalogItemId: 'a', name: 'A', quantity: 1, unitPriceCents: 1000 },
      { catalogItemId: 'b', name: 'B', quantity: 1, unitPriceCents: 500 },
    ];
    const result = updatePrice(items, 0, 2500);
    expect(result[1].unitPriceCents).toBe(500);
  });
});

describe('updatePrivateNote', () => {
  it('sets and clears a line private note without changing price', () => {
    const items: LineItem[] = [
      { catalogItemId: 'a', name: 'Item', quantity: 1, unitPriceCents: 1000 },
    ];
    const withNote = updatePrivateNote(items, 0, '  subcontractor check  ');
    expect(withNote[0]!.privateNote).toBe('subcontractor check');
    expect(withNote[0]!.unitPriceCents).toBe(1000);
    const cleared = updatePrivateNote(withNote, 0, '  ');
    expect(cleared[0]!.privateNote).toBeUndefined();
    expect(cleared[0]!.unitPriceCents).toBe(1000);
  });
});

describe('recalculateTotal', () => {
  it('returns 0 for empty array', () => {
    expect(recalculateTotal([])).toBe(0);
  });

  it('calculates total correctly for multiple items', () => {
    const items: LineItem[] = [
      { catalogItemId: 'a', name: 'A', quantity: 2, unitPriceCents: 1000 },
      { catalogItemId: 'b', name: 'B', quantity: 1, unitPriceCents: 500 },
    ];
    expect(recalculateTotal(items)).toBe(2500);
  });

  it('handles single item', () => {
    const items: LineItem[] = [
      { catalogItemId: 'a', name: 'A', quantity: 3, unitPriceCents: 400 },
    ];
    expect(recalculateTotal(items)).toBe(1200);
  });

  it('treats null/unknown prices as 0 in the total', () => {
    const items: LineItem[] = [
      { catalogItemId: '', name: 'Cabinets', quantity: 14, unitPriceCents: null, unit: 'foot' },
    ];
    expect(recalculateTotal(items)).toBe(0);
  });

  it('uses only the selected (base) option in the total', () => {
    const groupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const items: LineItem[] = [
      {
        catalogItemId: '',
        name: 'Walk-in shower',
        quantity: 1,
        unitPriceCents: 180000,
        optionGroupId: groupId,
        optionRole: 'base',
      },
      {
        catalogItemId: '',
        name: 'Keep the tub',
        quantity: 1,
        unitPriceCents: 45000,
        optionGroupId: groupId,
        optionRole: 'alt',
      },
      { catalogItemId: '', name: 'Vanity', quantity: 1, unitPriceCents: 80000 },
    ];
    expect(recalculateTotal(items)).toBe(260000);
    const selectedAlt = selectOptionForTotal(items, 1);
    expect(selectedAlt[0]!.optionRole).toBe('alt');
    expect(selectedAlt[1]!.optionRole).toBe('base');
    expect(recalculateTotal(selectedAlt)).toBe(125000);
  });
});

describe('adhoc / unknown prices', () => {
  it('parses a null catalogItemId and null price without crashing', () => {
    const result = parseLineItems(
      JSON.stringify([
        {
          catalogItemId: null,
          name: 'Laminate cabinets',
          quantity: 14,
          unit: 'foot',
          unitPriceCents: null,
          confidence: 0.8,
        },
      ]),
    );
    expect(result).toEqual([
      {
        catalogItemId: '',
        name: 'Laminate cabinets',
        quantity: 14,
        unitPriceCents: null,
        unit: 'foot',
        confidence: 0.8,
      },
    ]);
    expect(isUnknownUnitPrice(result[0]!.unitPriceCents)).toBe(true);
    expect(formatUnitPriceLabel(result[0]!.unitPriceCents)).toBe('Price needed');
    expect(formatQuantityLabel(14, 'foot')).toBe('14 ft');
  });

  it('round-trips a contractor privateNote on a line', () => {
    const json = JSON.stringify([
      {
        catalogItemId: '',
        name: 'Cabinets',
        quantity: 14,
        unitPriceCents: null,
        unit: 'foot',
        privateNote: 'moisture from neighbor',
      },
    ]);
    const parsed = parseLineItems(json);
    expect(parsed[0]!.privateNote).toBe('moisture from neighbor');
    expect(JSON.parse(serializeLineItems(parsed))[0].privateNote).toBe(
      'moisture from neighbor',
    );
  });

  it('round-trips attach priceSource on draft JSON', () => {
    const json = JSON.stringify([
      {
        catalogItemId: '',
        name: 'Labor',
        quantity: 2,
        unit: 'hour',
        unitPriceCents: 7500,
        priceSource: 'computed',
      },
      {
        catalogItemId: '',
        name: 'Cabinets',
        quantity: 14,
        unit: 'foot',
        unitPriceCents: null,
        priceSource: 'unknown',
      },
    ]);
    const parsed = parseLineItems(json);
    expect(parsed[0]!.priceSource).toBe('computed');
    expect(parsed[1]!.priceSource).toBe('unknown');
    expect(parseLineItems(JSON.stringify([{ name: 'X', quantity: 1, unitPriceCents: 1, priceSource: 'guessed' }]))[0]!.priceSource).toBeUndefined();
  });

  it('round-trips optionGroupId + optionRole on draft JSON', () => {
    const groupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const json = JSON.stringify([
      {
        catalogItemId: '',
        name: 'Walk-in shower',
        quantity: 1,
        unitPriceCents: 180000,
        optionGroupId: groupId,
        optionRole: 'base',
      },
      {
        catalogItemId: '',
        name: 'Keep the tub',
        quantity: 1,
        unitPriceCents: 45000,
        optionGroupId: groupId,
        optionRole: 'alt',
      },
    ]);
    const parsed = parseLineItems(json);
    expect(parsed[0]!.optionGroupId).toBe(groupId);
    expect(parsed[0]!.optionRole).toBe('base');
    expect(parsed[1]!.optionRole).toBe('alt');
    const roundTrip = JSON.parse(serializeLineItems(parsed));
    expect(roundTrip[0].optionGroupId).toBe(groupId);
    expect(roundTrip[1].optionRole).toBe('alt');
    expect(
      parseLineItems(
        JSON.stringify([{ name: 'X', quantity: 1, unitPriceCents: 1, optionRole: 'best' }]),
      )[0]!.optionRole,
    ).toBeUndefined();
  });

  it('round-trips roomId on draft JSON and keeps ungrouped lines without one', () => {
    const kitchenId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const json = JSON.stringify([
      {
        catalogItemId: '',
        name: 'Cabinets',
        quantity: 14,
        unitPriceCents: null,
        roomId: kitchenId,
      },
      { catalogItemId: '', name: 'Labor', quantity: 2, unitPriceCents: 7500 },
    ]);
    const parsed = parseLineItems(json);
    expect(parsed[0]!.roomId).toBe(kitchenId);
    expect(parsed[1]!.roomId).toBeUndefined();
    expect(parsed[0]!.unitPriceCents).toBeNull();
    expect(
      parseLineItems(
        JSON.stringify([{ name: 'X', quantity: 1, unitPriceCents: 1, roomId: 'kitchen' }]),
      )[0]!.roomId,
    ).toBeUndefined();
  });
});

describe('addAlternate / selectOptionForTotal / dissolve', () => {
  const GROUP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  it('links an unpaired line to one alternate without inventing a price', () => {
    const items: LineItem[] = [
      { catalogItemId: '', name: 'Walk-in shower', quantity: 1, unitPriceCents: 180000 },
    ];
    const paired = addAlternate(
      items,
      0,
      { name: 'Keep the tub', unitPriceCents: null },
      GROUP,
    );
    expect(paired).toHaveLength(2);
    expect(paired[0]).toMatchObject({
      name: 'Walk-in shower',
      optionGroupId: GROUP,
      optionRole: 'base',
      unitPriceCents: 180000,
    });
    expect(paired[1]).toMatchObject({
      name: 'Keep the tub',
      optionGroupId: GROUP,
      optionRole: 'alt',
      unitPriceCents: null,
      quantity: 1,
    });
    expect(recalculateTotal(paired)).toBe(180000);
    expect(addAlternate(paired, 0, { name: 'Third package', unitPriceCents: 1 }, GROUP)).toHaveLength(2);
  });

  it('clears the leftover partner when one side of the pair is removed', () => {
    const items: LineItem[] = [
      {
        catalogItemId: '',
        name: 'Walk-in shower',
        quantity: 1,
        unitPriceCents: 180000,
        optionGroupId: GROUP,
        optionRole: 'base',
      },
      {
        catalogItemId: '',
        name: 'Keep the tub',
        quantity: 1,
        unitPriceCents: 45000,
        optionGroupId: GROUP,
        optionRole: 'alt',
      },
    ];
    const leftover = removeItem(items, 1);
    expect(leftover).toHaveLength(1);
    expect(leftover[0]!.optionGroupId).toBeUndefined();
    expect(leftover[0]!.optionRole).toBeUndefined();
    expect(leftover[0]!.name).toBe('Walk-in shower');
  });
});
