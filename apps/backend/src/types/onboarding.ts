export interface SeedBody {
  trade: "plumbing" | "electrical" | "hvac";
}

export type Trade = SeedBody["trade"];

export interface TradeTemplateItem {
  name: string;
  unit: string;
  unitPriceCents: number;
  tradeCategory: string;
}

export interface SeedResponse {
  trade: Trade;
  itemCount: number;
  items: Array<{
    id: string;
    name: string;
    unit: string;
    unitPriceCents: number;
    tradeCategory: string;
  }>;
}
