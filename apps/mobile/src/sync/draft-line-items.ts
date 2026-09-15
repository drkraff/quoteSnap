import type { QuoteLineItemResponse } from '../api/quotes';
import { parseOptionGroupId, parseOptionRole } from '../quotes/option-groups';
import { assignNormalizedPrivateNote } from '../quotes/private-notes';
import { parseRoomId } from '../quotes/rooms';
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
    assignNormalizedPrivateNote(line, item.privateNote);
    const priceSource = parsePriceSource(item.priceSource);
    if (priceSource) {
      line.priceSource = priceSource;
    }
    const optionGroupId = parseOptionGroupId(item.optionGroupId);
    const optionRole = parseOptionRole(item.optionRole);
    if (optionGroupId && optionRole) {
      line.optionGroupId = optionGroupId;
      line.optionRole = optionRole;
    }
    const roomId = parseRoomId(item.roomId);
    if (roomId) {
      line.roomId = roomId;
    }
    const clientId = parseRoomId(item.clientId);
    if (clientId) {
      line.clientId = clientId;
    }
    return line;
  });
}
