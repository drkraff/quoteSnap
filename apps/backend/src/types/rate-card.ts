export type RateCardSource = "typed" | "confirmed" | "imported";

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

export type UpsertRateCardBody = {
  name: string;
  unit: string;
  unitPriceCents: number;
  trade?: string | null;
  source?: RateCardSource;
};
