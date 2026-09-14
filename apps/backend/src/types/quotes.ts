export interface QuoteResponse {
  id: string;
  status: string;
  customerPhone: string | null;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  voiceJobId: string | null;
  isArchived: boolean;
}

export interface QuoteLineItemResponse {
  id: string;
  name: string;
  quantity: number;
  /** Snapshot cents. 0 means unknown/blank on adhoc voice lines. */
  unitPriceCents: number | null;
  unit?: string | null;
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
  unitPriceCents: number | null;
  unit?: string | null;
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
