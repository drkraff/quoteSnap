import { apiClient } from './client';

export type Trade = 'plumbing' | 'electrical' | 'hvac';

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

export async function seedCatalog(trade: Trade): Promise<SeedResponse> {
  return apiClient.post<SeedResponse>('/onboarding/seed', { trade });
}
