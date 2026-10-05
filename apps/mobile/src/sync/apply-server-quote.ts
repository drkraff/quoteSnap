import { Q } from '@nozbe/watermelondb';
import type { QuoteLineItemResponse, QuoteResponse } from '../api/quotes';
import { database } from '../db';
import { CatalogItem } from '../db/models/catalog-item';
import { Draft } from '../db/models/draft';
import { Quote } from '../db/models/quote';
import { serializeLineItems } from '../utils/line-items';
import { toDraftLineItems } from './draft-line-items';
import { assignStoredAiFailureStage } from '../quotes/ai-failed-recovery';
import { assignPulledQuoteTextFields } from './local-dirty';
import { mergeStoredPhotosWithServer, serializePhotos, type ServerQuotePhoto } from '../quotes/photos';
import { assignServerRevision } from './server-revision';

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
    // followed_up_at and follow_up_dismissed stay as stored locally.
    record.status = serverQuote.status;
    assignPulledQuoteTextFields(record, serverQuote);
    record.totalCents = serverQuote.totalCents;
    record.updatedAt = updatedAt;
    record.sentAt = serverQuote.sentAt ? parseServerDate(serverQuote.sentAt) : null;
    record.voiceJobId = serverQuote.voiceJobId;
    record.isArchived = serverQuote.isArchived === true;
    record.photosJson = serializePhotos(
      mergeStoredPhotosWithServer(
        record.photosJson,
        (serverQuote.photos ?? []) as ServerQuotePhoto[],
      ),
    );
    assignStoredAiFailureStage(record, serverQuote.status, serverQuote.failureStage);
    assignServerRevision(record, serverQuote.id, serverQuote.updatedAt);
  });
  await draft.update((record) => {
    record.lineItemsJson = lineItemsJson;
    record.updatedAt = updatedAt;
  });
}
