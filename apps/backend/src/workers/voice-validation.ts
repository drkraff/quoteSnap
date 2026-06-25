import type { AILineItem } from '../types/voice.js';

export type CatalogItemRow = {
  id: string;
  name: string;
  unit_price_cents: number;
};

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
