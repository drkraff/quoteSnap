export interface QuoteResponse {
  id: string;
  status: string;
  customerPhone: string | null;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  voiceJobId: string | null;
}

export interface QuoteLineItemResponse {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  confidence: number | null;
  catalogItemId: string | null;
}

export interface QuoteListItemResponse extends QuoteResponse {
  lineItems: QuoteLineItemResponse[];
}

export interface CreateQuoteBody {
  status?: string;
  customerPhone?: string;
  totalCents?: number;
}

export interface UpdateQuoteLineItemBody {
  name: string;
  quantity: number;
  unitPriceCents: number;
  /** Omit to preserve existing AI confidence; null clears. */
  confidence?: number | null;
  /** Omit to preserve existing catalog_item_id; null clears. */
  catalogItemId?: string | null;
}

export interface UpdateQuoteBody {
  status?: string;
  customerPhone?: string;
  totalCents?: number;
  lineItems?: UpdateQuoteLineItemBody[];
}
