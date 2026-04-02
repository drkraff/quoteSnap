export interface LineItem {
  catalogItemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export function parseLineItems(json: string): LineItem[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as LineItem[]) : [];
  } catch {
    return [];
  }
}

export function addItem(
  items: LineItem[],
  catalogItem: { id: string; name: string; unitPriceCents: number },
): LineItem[] {
  return [
    ...items,
    {
      catalogItemId: catalogItem.id,
      name: catalogItem.name,
      quantity: 1,
      unitPriceCents: catalogItem.unitPriceCents,
    },
  ];
}

export function removeItem(items: LineItem[], index: number): LineItem[] {
  return items.filter((_, i) => i !== index);
}

export function updateQuantity(
  items: LineItem[],
  index: number,
  delta: number,
): LineItem[] {
  return items.map((item, i) =>
    i === index
      ? { ...item, quantity: Math.max(1, item.quantity + delta) }
      : item,
  );
}

export function updatePrice(
  items: LineItem[],
  index: number,
  newPriceCents: number,
): LineItem[] {
  return items.map((item, i) =>
    i === index ? { ...item, unitPriceCents: newPriceCents } : item,
  );
}

export function recalculateTotal(items: LineItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0,
  );
}

export function serializeLineItems(items: LineItem[]): string {
  return JSON.stringify(items);
}
