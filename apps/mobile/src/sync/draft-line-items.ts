import type { QuoteLineItemResponse } from '../api/quotes';
import type { LineItem } from '../utils/line-items';
import { parsePriceSource } from '../utils/price-source';

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
    if (item.unit) {
      line.unit = item.unit;
    }
    if (item.confidence != null) {
      line.confidence = item.confidence;
    }
    if (item.privateNote) {
      line.privateNote = item.privateNote;
    }
    const priceSource = parsePriceSource(item.priceSource);
    if (priceSource) {
      line.priceSource = priceSource;
    }
    return line;
  });
}
