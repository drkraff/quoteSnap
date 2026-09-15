import { apiClient } from './client';

export interface QuoteResponse {
  id: string;
  status: string;
  customerPhone: string | null;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  voiceJobId: string | null;
  isArchived?: boolean;
  /** Contractor-only. Never copy into a customer PDF/SMS payload. */
  privateNote?: string | null;
  /** Customer-facing scope / assumptions. Include on PDF/SMS. */
  clientSentence?: string | null;
  /** Thin rooms/zones. Empty = single-memo / ungrouped. */
  rooms?: {
    id: string;
    name: string;
    privateNote?: string | null;
  }[];
}

export interface QuoteLineItemResponse {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  unit?: string | null;
  confidence?: number | null;
  catalogItemId?: string | null;
  /** Contractor-only. Never copy into a customer PDF/SMS payload. */
  privateNote?: string | null;
  /** Snapshot provenance from attach or contractor edit. */
  priceSource?: string | null;
  /** Shared UUID for a thin base+alternate pair. */
  optionGroupId?: string | null;
  /** base = in the quote total; alt = visible, excluded from total. */
  optionRole?: string | null;
  /** Optional room/zone. Null = ungrouped / default single-memo. */
  roomId?: string | null;
}

export interface QuoteListItem extends QuoteResponse {
  lineItems: QuoteLineItemResponse[];
}

interface QuoteListResponse {
  quotes: QuoteListItem[];
}

interface QuoteDetailResponse {
  quote: QuoteResponse;
  lineItems: QuoteLineItemResponse[];
}

interface QuoteSingleResponse {
  quote: QuoteResponse;
}

export async function fetchQuotes(options?: {
  archived?: boolean;
}): Promise<QuoteListItem[]> {
  const path = options?.archived === true ? '/quotes?archived=true' : '/quotes';
  const data = await apiClient.get<QuoteListResponse>(path);
  return data.quotes;
}

export async function fetchQuote(
  serverId: string,
): Promise<QuoteDetailResponse> {
  return apiClient.get<QuoteDetailResponse>(`/quotes/${serverId}`);
}

export async function createQuoteOnServer(body: {
  status?: string;
  customerPhone?: string;
  totalCents?: number;
  privateNote?: string | null;
  clientSentence?: string | null;
}): Promise<QuoteResponse> {
  const data = await apiClient.post<QuoteSingleResponse>('/quotes', body);
  return data.quote;
}

export async function updateQuoteOnServer(
  serverId: string,
  body: {
    status?: string;
    customerPhone?: string;
    totalCents?: number;
    privateNote?: string | null;
    clientSentence?: string | null;
    rooms?: {
      id: string;
      name: string;
      privateNote?: string | null;
    }[];
    lineItems?: {
      name: string;
      quantity: number;
      unitPriceCents: number | null;
      unit?: string | null;
      privateNote?: string | null;
      priceSource?: string | null;
      optionGroupId?: string | null;
      optionRole?: string | null;
      roomId?: string | null;
    }[];
  },
): Promise<QuoteResponse> {
  const data = await apiClient.put<QuoteSingleResponse>(
    `/quotes/${serverId}`,
    body,
  );
  return data.quote;
}

export async function archiveQuote(serverId: string): Promise<void> {
  await apiClient.patch<{ archived: boolean }>(`/quotes/${serverId}/archive`, {
    archived: true,
  });
}

export async function unarchiveQuote(serverId: string): Promise<void> {
  await apiClient.patch<{ archived: boolean }>(`/quotes/${serverId}/archive`, {
    archived: false,
    isArchived: false,
  });
}
