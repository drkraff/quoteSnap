import type { CatalogUnit } from "../catalog/units.js";

export interface SeedBody {
  trade: "plumbing" | "electrical" | "hvac";
}

export interface OnboardingProfileBody {
  trade: "plumbing" | "electrical" | "hvac";
  hourlyRateCents: number;
  markupPercent?: number | null;
}

export interface OnboardingProfileResponse {
  contractor: {
    id: string;
    email: string | null;
    phone: string | null;
    displayName: string | null;
    trade: string;
    hourlyRateCents: number;
    markupPercent: number | null;
  };
}

export type Trade = SeedBody["trade"];

export interface TradeTemplateItem {
  name: string;
  unit: CatalogUnit;
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
