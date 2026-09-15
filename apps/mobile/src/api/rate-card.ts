import { apiClient } from './client';
import { rateCardListPath } from '../rate-card/list-query';

export type RateCardSource = 'typed' | 'confirmed' | 'imported';

export type RateCardHistoryEntry = {
  unitPriceCents: number;
  recordedAt: string;
};

export type RateCardEntryResponse = {
  id: string;
  normalizedName: string;
  displayName: string;
  unit: string;
  trade: string | null;
  unitPriceCents: number;
  useCount: number;
  source: RateCardSource;
  priceHistory: RateCardHistoryEntry[];
  createdAt: string;
  updatedAt: string;
};

export type ImportRateCardResponse = {
  imported: number;
  skipped: number;
  skippedLines?: { raw: string; reason: string }[];
  entries: RateCardEntryResponse[];
  unreadableFiles: { filename: string; reason: string }[];
  message: string;
};

interface RateCardUpsertResponse {
  entry: RateCardEntryResponse;
}

interface RateCardLookupResponse {
  entry: RateCardEntryResponse | null;
}

export type RateCardListResponse = {
  entries: RateCardEntryResponse[];
  limit: number;
  offset: number;
  total: number;
};

export async function upsertRateCardEntry(body: {
  name: string;
  unit: string;
  unitPriceCents: number;
  trade?: string;
  source?: RateCardSource;
}): Promise<RateCardEntryResponse> {
  const data = await apiClient.post<RateCardUpsertResponse>('/rate-card', body);
  return data.entry;
}

export async function lookupRateCardEntry(query: {
  name: string;
  unit: string;
  trade?: string;
}): Promise<RateCardEntryResponse | null> {
  const params = new URLSearchParams({ name: query.name, unit: query.unit });
  if (query.trade) {
    params.set('trade', query.trade);
  }
  const data = await apiClient.get<RateCardLookupResponse>(`/rate-card?${params.toString()}`);
  return data.entry;
}

export async function importRateCardFromText(body: {
  text: string;
  trade?: string;
  documents?: { filename: string; mime: string; text?: string }[];
}): Promise<ImportRateCardResponse> {
  return apiClient.post<ImportRateCardResponse>('/rate-card/import', body);
}

/** Omit `name` so GET /rate-card stays a list, not exact lookup. Optional `q` is substring filter. */
export async function listRateCardEntries(query?: {
  limit?: number;
  offset?: number;
  q?: string;
  unit?: string;
}): Promise<RateCardListResponse> {
  return apiClient.get<RateCardListResponse>(rateCardListPath(query));
}

export async function deleteRateCardEntry(id: string): Promise<{ deleted: true }> {
  return apiClient.delete<{ deleted: true }>(`/rate-card/${id}`);
}
