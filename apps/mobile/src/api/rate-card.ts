import { apiClient } from './client';

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
  source: 'typed' | 'confirmed';
  priceHistory: RateCardHistoryEntry[];
  createdAt: string;
  updatedAt: string;
};

interface RateCardUpsertResponse {
  entry: RateCardEntryResponse;
}

interface RateCardLookupResponse {
  entry: RateCardEntryResponse | null;
}

export async function upsertRateCardEntry(body: {
  name: string;
  unit: string;
  unitPriceCents: number;
  trade?: string;
  source?: 'typed' | 'confirmed';
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
