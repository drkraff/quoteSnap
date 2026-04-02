import {
  parseLineItems,
  addItem,
  removeItem,
  updateQuantity,
  updatePrice,
  recalculateTotal,
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
});
