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

export interface CreateQuoteBody {
  status?: string;
  customerPhone?: string;
  totalCents?: number;
}

export interface UpdateQuoteBody {
  status?: string;
  customerPhone?: string;
  totalCents?: number;
  lineItems?: Array<{ name: string; quantity: number; unitPriceCents: number }>;
}
