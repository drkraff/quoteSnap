import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as authApi from '../api/auth';
import type { ContractorResponse } from '../api/auth';

const KEYS = {
  ACCESS_TOKEN: 'quotesnap_access_token',
  REFRESH_TOKEN: 'quotesnap_refresh_token',
  CONTRACTOR: 'quotesnap_contractor',
  ONBOARDING_COMPLETE: 'quotesnap_onboarding_complete',
} as const;

export type Contractor = ContractorResponse;

interface AuthState {
  contractor: Contractor | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  onboardingComplete: boolean;
}

interface AuthActions {
  login(params: { email?: string; phone?: string; password: string }): Promise<void>;
  register(params: {
    email?: string;
    phone?: string;
    password: string;
    displayName?: string;
  }): Promise<void>;
  logout(): Promise<void>;
  refreshSession(): Promise<boolean>;
  restoreSession(): Promise<void>;
  setOnboardingComplete(): Promise<void>;
}

async function storeTokens(
  accessToken: string,
  refreshToken: string,
  contractor: Contractor,
): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, accessToken),
    SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refreshToken),
    SecureStore.setItemAsync(KEYS.CONTRACTOR, JSON.stringify(contractor)),
  ]);
}

async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN),
    SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN),
    SecureStore.deleteItemAsync(KEYS.CONTRACTOR),
    SecureStore.deleteItemAsync(KEYS.ONBOARDING_COMPLETE),
  ]);
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  contractor: null,
  accessToken: null,
  refreshToken: null,
  isLoading: true,
  isAuthenticated: false,
  onboardingComplete: false,

  async login(params) {
    const response = await authApi.login(params);
    await storeTokens(response.accessToken, response.refreshToken, response.contractor);
    // Returning user who already onboarded has a trade set
    const alreadyOnboarded = response.contractor.trade !== null;
    if (alreadyOnboarded) {
      await SecureStore.setItemAsync(KEYS.ONBOARDING_COMPLETE, 'true');
    }
    set({
      contractor: response.contractor,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      isAuthenticated: true,
      onboardingComplete: alreadyOnboarded,
    });
  },

  async register(params) {
    const response = await authApi.register(params);
    await storeTokens(response.accessToken, response.refreshToken, response.contractor);
    set({
      contractor: response.contractor,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      isAuthenticated: true,
      onboardingComplete: false,
    });
  },

  async logout() {
    const { refreshToken } = get();
    // Best-effort server-side revocation — do not throw on failure
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Ignore logout errors — local session cleared regardless
      }
    }
    await clearTokens();
    set({
      contractor: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      onboardingComplete: false,
    });
  },

  async refreshSession(): Promise<boolean> {
    const { refreshToken } = get();
    if (!refreshToken) return false;
    try {
      const response = await authApi.refresh(refreshToken);
      const { contractor } = get();
      if (contractor) {
        await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, response.accessToken);
        await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, response.refreshToken);
      }
      set({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      return true;
    } catch {
      return false;
    }
  },

  async restoreSession(): Promise<void> {
    try {
      const [storedAccessToken, storedRefreshToken, storedContractor, storedOnboarding] =
        await Promise.all([
          SecureStore.getItemAsync(KEYS.ACCESS_TOKEN),
          SecureStore.getItemAsync(KEYS.REFRESH_TOKEN),
          SecureStore.getItemAsync(KEYS.CONTRACTOR),
          SecureStore.getItemAsync(KEYS.ONBOARDING_COMPLETE),
        ]);

      if (!storedRefreshToken || !storedContractor) {
        set({ isLoading: false });
        return;
      }

      const contractor = JSON.parse(storedContractor) as Contractor;
      const onboardingComplete = storedOnboarding === 'true';

      if (storedAccessToken) {
        // Set tokens immediately; access token may be expired but will auto-refresh on first API call
        set({
          contractor,
          accessToken: storedAccessToken,
          refreshToken: storedRefreshToken,
          isAuthenticated: true,
          isLoading: false,
          onboardingComplete,
        });
      } else {
        // Access token missing — attempt refresh
        set({ refreshToken: storedRefreshToken });
        const refreshed = await get().refreshSession();
        if (refreshed) {
          set({
            contractor,
            isAuthenticated: true,
            isLoading: false,
            onboardingComplete,
          });
        } else {
          await clearTokens();
          set({ isLoading: false });
        }
      }
    } catch {
      // If SecureStore fails for any reason, treat as unauthenticated
      set({ isLoading: false });
    }
  },

  async setOnboardingComplete(): Promise<void> {
    await SecureStore.setItemAsync(KEYS.ONBOARDING_COMPLETE, 'true');
    set({ onboardingComplete: true });
  },
}));
