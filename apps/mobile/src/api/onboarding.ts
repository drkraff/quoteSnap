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

export async function saveOnboardingProfile(params: {
  trade: Trade;
  hourlyRateCents: number;
  markupPercent?: number | null;
}): Promise<OnboardingProfileResponse> {
  return apiClient.post<OnboardingProfileResponse>('/onboarding/profile', params);
}

export async function seedCatalog(trade: Trade): Promise<SeedResponse> {
  return apiClient.post<SeedResponse>('/onboarding/seed', { trade });
}
