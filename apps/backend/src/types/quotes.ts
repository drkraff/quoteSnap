export interface QuoteRoomResponse {
  id: string;
  name: string;
  /** Contractor-only. Never copy into a customer PDF/SMS/approval payload. */
  privateNote: string | null;
}

export interface QuotePhotoResponse {
  id: string;
  clientId: string;
  mime: string;
  roomId: string | null;
  lineClientId: string | null;
  uploaded: true;
}

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
  /** Contractor-only. Never copy into a customer PDF/SMS/approval payload. */
  privateNote: string | null;
  /** Customer-facing scope / assumptions. Include on PDF/SMS/approval. */
  clientSentence: string | null;
  /** Thin rooms/zones. Empty = single-memo / ungrouped. */
  rooms: QuoteRoomResponse[];
  /** Contractor-only stills. Never copy into a customer PDF/SMS/approval payload. */
  photos?: QuotePhotoResponse[];
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
  /** Contractor-only. Never copy into a customer PDF/SMS/approval payload. */
  privateNote: string | null;
  /** Snapshot provenance from attach or contractor edit. */
  priceSource?: string | null;
  /** Shared UUID for a thin base+alternate pair. Null = ungrouped. */
  optionGroupId?: string | null;
  /** base = in the quote total; alt = visible, excluded from total. */
  optionRole?: string | null;
  /** Optional room/zone. Null = ungrouped / default single-memo. */
  roomId?: string | null;
  /** Client-stable id for photo-on-line attach. Null on older rows. */
  clientId?: string | null;
}

export interface QuoteListItemResponse extends QuoteResponse {
  lineItems: QuoteLineItemResponse[];
}

export interface CreateQuoteBody {
  status?: string;
  customerPhone?: string;
  totalCents?: number;
  privateNote?: string | null;
  clientSentence?: string | null;
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
  /** Omit to preserve existing private_note; null clears. Contractor-only. */
  privateNote?: string | null;
  /** Omit to preserve existing price_source. */
  priceSource?: string | null;
  /** Omit to preserve; null clears the pair. */
  optionGroupId?: string | null;
  /** Omit to preserve; null clears the pair. base | alt. */
  optionRole?: string | null;
  /** Omit to preserve; null clears. Matches quotes.rooms[].id. */
  roomId?: string | null;
  /** Omit to preserve; null clears. Client-stable photo attach. */
  clientId?: string | null;
}

export interface UpdateQuoteBody {
  status?: string;
  customerPhone?: string;
  totalCents?: number;
  /** Contractor-only job note. Omit to preserve; null clears. */
  privateNote?: string | null;
  /** Customer-facing quote note. Omit to preserve; null clears. */
  clientSentence?: string | null;
  /** Full replacement of rooms/zones. Omit to preserve; [] clears. */
  rooms?: QuoteRoomResponse[];
  lineItems?: UpdateQuoteLineItemBody[];
}
