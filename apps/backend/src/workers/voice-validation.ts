import type { AILineItem } from '../types/voice.js';

export type CatalogItemRow = {
  id: string;
  name: string;
  unit_price_cents: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Drop AI-invented non-UUID catalog IDs before they are bound to
 * `id = ANY($n::uuid[])`. Invalid values crash Postgres instead of filtering.
 */
export function filterUuidCatalogIds(ids: string[]): string[] {
  return ids.filter((id) => UUID_RE.test(id));
}

export interface ValidatedLineItem {
  catalogItemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  confidence: number;
}

/**
 * Filters AI-returned items to only those present in the contractor's catalog,
 * builds validated line items with catalog prices, and calculates total.
 */
export function validateAndBuildLineItems(
  aiItems: AILineItem[],
  validCatalogItems: CatalogItemRow[]
): { lineItems: ValidatedLineItem[]; totalCents: number } {
  const validCatalogMap = new Map<string, CatalogItemRow>(
    validCatalogItems.map(item => [item.id, item])
  );

  const validatedItems = aiItems.filter(item => validCatalogMap.has(item.catalogItemId));

  const lineItems = validatedItems.map(item => {
    const catalogItem = validCatalogMap.get(item.catalogItemId)!;
    return {
      catalogItemId: item.catalogItemId,
      name: catalogItem.name,
      quantity: item.quantity,
      unitPriceCents: catalogItem.unit_price_cents,
      confidence: item.confidence,
    };
  });

  const totalCents = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);

  return { lineItems, totalCents };
}
