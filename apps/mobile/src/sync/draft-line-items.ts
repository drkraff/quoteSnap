import type { QuoteLineItemResponse } from '../api/quotes';
import type { LineItem } from '../utils/line-items';

export function toDraftLineItems(
  lineItems: QuoteLineItemResponse[],
  localIdByServerCatalogId: Map<string, string>,
): LineItem[] {
  return lineItems.map((item) => {
    const serverCatalogId = item.catalogItemId ?? '';
    const localCatalogId = serverCatalogId
      ? (localIdByServerCatalogId.get(serverCatalogId) ?? serverCatalogId)
      : '';
    const line: LineItem = {
      catalogItemId: localCatalogId,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    };
    if (item.confidence != null) {
      line.confidence = item.confidence;
    }
    return line;
  });
}
