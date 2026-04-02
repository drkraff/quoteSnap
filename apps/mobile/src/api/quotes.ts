import { apiClient } from './client';

export interface QuoteResponse {
  id: string;
  status: string;
  customerPhone: string | null;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export interface QuoteLineItemResponse {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

interface QuoteListResponse {
  quotes: QuoteResponse[];
}

interface QuoteDetailResponse {
  quote: QuoteResponse;
  lineItems: QuoteLineItemResponse[];
}

interface QuoteSingleResponse {
  quote: QuoteResponse;
}

export async function fetchQuotes(): Promise<QuoteResponse[]> {
  const data = await apiClient.get<QuoteListResponse>('/quotes');
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
    lineItems?: Array<{ name: string; quantity: number; unitPriceCents: number }>;
  },
): Promise<QuoteResponse> {
  const data = await apiClient.put<QuoteSingleResponse>(
    `/quotes/${serverId}`,
    body,
  );
  return data.quote;
}
