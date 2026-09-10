import { Q } from '@nozbe/watermelondb';
import type { QuoteLineItemResponse, QuoteResponse } from '../api/quotes';
import { database } from '../db';
import { CatalogItem } from '../db/models/catalog-item';
import { Draft } from '../db/models/draft';
import { Quote } from '../db/models/quote';
import { serializeLineItems } from '../utils/line-items';
import { toDraftLineItems } from './draft-line-items';

export function parseServerDate(iso: string): Date {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function serverLineItemsJsonForContractor(
  contractorId: string,
  lineItems: QuoteLineItemResponse[],
): Promise<string> {
  const catalogRows = await database
    .get<CatalogItem>('catalog_items')
    .query(Q.where('contractor_id', contractorId))
    .fetch();
  const localIdByServerCatalogId = new Map<string, string>();
  for (const item of catalogRows) {
    if (item.serverId) {
      localIdByServerCatalogId.set(item.serverId, item.id);
    }
  }
  return serializeLineItems(toDraftLineItems(lineItems, localIdByServerCatalogId));
}

export async function applyServerQuoteInWrite(
  localQuote: Quote,
  draft: Draft,
  serverQuote: QuoteResponse,
  lineItemsJson: string,
): Promise<void> {
  const updatedAt = parseServerDate(serverQuote.updatedAt);
  await localQuote.update((record) => {
    record.status = serverQuote.status;
    record.customerPhone = serverQuote.customerPhone;
    record.totalCents = serverQuote.totalCents;
    record.updatedAt = updatedAt;
    record.sentAt = serverQuote.sentAt ? parseServerDate(serverQuote.sentAt) : null;
    record.voiceJobId = serverQuote.voiceJobId;
  });
  await draft.update((record) => {
    record.lineItemsJson = lineItemsJson;
    record.updatedAt = updatedAt;
  });
}
