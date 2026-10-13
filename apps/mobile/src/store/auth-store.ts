import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as authApi from '../api/auth';
import type { ContractorResponse } from '../api/auth';
import { isUnauthorizedError } from '../api/client';
import { accessTokenExpired, parseStoredContractor } from '../auth/stored-session';
import { localeFromUnknown, type ContractorLocale, type CountryCode } from '../money/currency';
import { noteStartup } from '../startup/trace';
import { createSingleFlight } from '../sync/single-flight';

const KEYS = {
  ACCESS_TOKEN: 'quotesnap_access_token',
  REFRESH_TOKEN: 'quotesnap_refresh_token',
  CONTRACTOR: 'quotesnap_contractor',
  ONBOARDING_COMPLETE: 'quotesnap_onboarding_complete',
} as const;

/**
 * Bumped when login, register, or logout starts. An in-flight restore or
 * refresh must not write tokens or clear the session after that.
 */
let authEpoch = 0;
const restoreFlight = createSingleFlight();

function bumpAuthEpoch(): number {
  authEpoch += 1;
  return authEpoch;
}

export function resetAuthSessionForTests(): void {
  authEpoch = 0;
  restoreFlight.reset();
}

export type Contractor = ContractorResponse;

function withLocale(contractor: Contractor): Contractor {
  return { ...contractor, ...localeFromUnknown(contractor) };
}

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
  updateContractorProfile(profile: {
    trade?: string | null;
    hourlyRateCents?: number | null;
    markupPercent?: number | null;
    currencyCode?: ContractorLocale['currencyCode'];
    unitSystem?: ContractorLocale['unitSystem'];
    vatPercent?: number;
    countryCode?: CountryCode | null;
  }): Promise<void>;
  setOnboardingComplete(profile: {
    trade: string;
    hourlyRateCents?: number | null;
    markupPercent?: number | null;
  }): Promise<void>;
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

function loggedOutState(): Pick<
  AuthState,
  | 'contractor'
  | 'accessToken'
  | 'refreshToken'
  | 'isAuthenticated'
  | 'onboardingComplete'
  | 'isLoading'
> {
  return {
    contractor: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    onboardingComplete: false,
    isLoading: false,
  };
}

async function restoreSessionOnce(
  get: () => { refreshSession: () => Promise<boolean> },
  set: (partial: Partial<AuthState>) => void,
): Promise<void> {
  const epoch = authEpoch;
  try {
    const [storedAccessToken, storedRefreshToken, storedContractor, storedOnboarding] =
      await Promise.all([
        SecureStore.getItemAsync(KEYS.ACCESS_TOKEN),
        SecureStore.getItemAsync(KEYS.REFRESH_TOKEN),
        SecureStore.getItemAsync(KEYS.CONTRACTOR),
        SecureStore.getItemAsync(KEYS.ONBOARDING_COMPLETE),
      ]);
    if (epoch !== authEpoch) return;

    const stored = parseStoredContractor(storedContractor) as Contractor | null;
    const contractor = stored ? withLocale(stored) : null;
    const hadStoredSession = Boolean(
      storedRefreshToken || storedAccessToken || storedContractor,
    );
    if (!storedRefreshToken || !contractor) {
      if (hadStoredSession) {
        try {
          if (epoch !== authEpoch) return;
          await clearTokens();
        } catch {
          // Still leave the app logged out.
        }
      }
      if (epoch !== authEpoch) return;
      set(loggedOutState());
      noteStartup('session_ready', { kind: 'logged_out' });
      return;
    }

    const onboardingComplete = storedOnboarding === 'true';
    const hasAccessToken = typeof storedAccessToken === 'string' && storedAccessToken.length > 0;
    const accessExpired = !hasAccessToken || accessTokenExpired(storedAccessToken, Date.now());

    // A stored access token (even an expired one) plus the cached contractor
    // is enough to paint Quotes from WatermelonDB. Refresh and hydrate follow.
    // With no access token at all, keep the splash until refresh settles so
    // the root gate (it requires an access token) does not bounce through login.
    if (epoch !== authEpoch) return;
    if (hasAccessToken) {
      set({
        contractor,
        accessToken: storedAccessToken,
        refreshToken: storedRefreshToken,
        isAuthenticated: true,
        isLoading: false,
        onboardingComplete,
      });
      noteStartup('session_ready', { kind: 'local' });
    } else {
      set({ refreshToken: storedRefreshToken });
    }

    if (accessExpired) {
      try {
        const refreshed = await get().refreshSession();
        if (epoch !== authEpoch) return;
        if (!refreshed) {
          await clearTokens();
          if (epoch !== authEpoch) return;
          set(loggedOutState());
          noteStartup(hasAccessToken ? 'session_revoked' : 'session_ready', {
            kind: 'logged_out',
          });
          return;
        }
        if (!hasAccessToken) {
          if (epoch !== authEpoch) return;
          set({
            contractor,
            isAuthenticated: true,
            isLoading: false,
            onboardingComplete,
          });
          noteStartup('session_ready', { kind: 'local' });
        }
      } catch {
        // Network / server unavailable — keep the local session; do not revoke.
        if (epoch !== authEpoch) return;
        if (!hasAccessToken) {
          set({
            contractor,
            accessToken: storedAccessToken,
            refreshToken: storedRefreshToken,
            isAuthenticated: true,
            isLoading: false,
            onboardingComplete,
          });
          noteStartup('session_ready', { kind: 'local' });
        }
      }
    }

    if (epoch !== authEpoch) return;
    await pullLocalState(contractor.id);
  } catch {
    // Unreadable SecureStore (corrupt ciphertext). Clear it so the next
    // launch is not stuck throwing, unless a login already replaced the session.
    if (epoch !== authEpoch) return;
    try {
      await clearTokens();
    } catch {
      // Still leave the app logged out.
    }
    if (epoch !== authEpoch) return;
    set(loggedOutState());
    noteStartup('session_ready', { kind: 'logged_out' });
  }
}

/** Pull catalog/quotes after auth. Failures must not undo a successful login/restore. */
async function pullLocalState(contractorId: string): Promise<void> {
  noteStartup('hydrate_start');
  try {
    // Lazy require avoids loading WatermelonDB when auth-store is imported from API tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { hydrateFromServer } = require('../sync/hydrate') as typeof import('../sync/hydrate');
    await hydrateFromServer(contractorId);
  } catch {
    // Offline or server error — local DB stays as-is; next restore retries.
  } finally {
    noteStartup('hydrate_end');
  }
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  contractor: null,
  accessToken: null,
  refreshToken: null,
  isLoading: true,
  isAuthenticated: false,
  onboardingComplete: false,

  async login(params) {
    const epoch = bumpAuthEpoch();
    const response = await authApi.login(params);
    if (epoch !== authEpoch) return;
    const contractor = withLocale(response.contractor);
    await storeTokens(response.accessToken, response.refreshToken, contractor);
    if (epoch !== authEpoch) return;
    // Returning user who already onboarded has a trade set
    const alreadyOnboarded = contractor.trade !== null;
    if (alreadyOnboarded) {
      await SecureStore.setItemAsync(KEYS.ONBOARDING_COMPLETE, 'true');
    }
    if (epoch !== authEpoch) return;
    set({
      contractor,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      isAuthenticated: true,
      isLoading: false,
      onboardingComplete: alreadyOnboarded,
    });
    await pullLocalState(contractor.id);
  },

  async register(params) {
    const epoch = bumpAuthEpoch();
    const response = await authApi.register(params);
    if (epoch !== authEpoch) return;
    const contractor = withLocale(response.contractor);
    await storeTokens(response.accessToken, response.refreshToken, contractor);
    if (epoch !== authEpoch) return;
    set({
      contractor,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      isAuthenticated: true,
      isLoading: false,
      onboardingComplete: false,
    });
  },

  async logout() {
    const epoch = bumpAuthEpoch();
    const { refreshToken, contractor } = get();
    if (contractor?.id) {
      try {
        // Lazy require: sync-queue pulls the database, and this store is imported from API tests.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { retainQueuedWorkForContractor } = require('../sync/sync-queue') as typeof import('../sync/sync-queue');
        await retainQueuedWorkForContractor(contractor.id);
      } catch {
        // The queue is still unowned. Do not clear the session, or the next
        // account could upload those rows.
        return;
      }
    }
    if (epoch !== authEpoch) return;
    // Best-effort server-side revocation — do not throw on failure
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Ignore logout errors — local session cleared regardless
      }
    }
    if (epoch !== authEpoch) return;
    try {
      await clearTokens();
    } catch {
      // The owner stamp already landed. Still drop the in-memory session.
    }
    if (epoch !== authEpoch) return;
    set({
      contractor: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      onboardingComplete: false,
    });
  },

  async refreshSession(): Promise<boolean> {
    const epoch = authEpoch;
    const { refreshToken } = get();
    if (!refreshToken) return false;
    try {
      const response = await authApi.refresh(refreshToken);
      if (epoch !== authEpoch) return false;
      // Persist even when contractor is still null (restoreSession sets tokens first).
      await Promise.all([
        SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, response.accessToken),
        SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, response.refreshToken),
      ]);
      if (epoch !== authEpoch) return false;
      set({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      return true;
    } catch (err) {
      // 401 = refresh token rejected. Transport / 5xx must not look like logout.
      if (isUnauthorizedError(err)) {
        return false;
      }
      throw err;
    }
  },

  async restoreSession(): Promise<void> {
    return restoreFlight.run(() => restoreSessionOnce(get, set));
  },

  async updateContractorProfile(profile: {
    trade?: string | null;
    hourlyRateCents?: number | null;
    markupPercent?: number | null;
    currencyCode?: ContractorLocale['currencyCode'];
    unitSystem?: ContractorLocale['unitSystem'];
    vatPercent?: number;
    countryCode?: CountryCode | null;
  }): Promise<void> {
    const contractor = get().contractor;
    if (!contractor) return;
    const updated: Contractor = withLocale({
      ...contractor,
      trade: profile.trade !== undefined ? profile.trade : contractor.trade,
      hourlyRateCents:
        profile.hourlyRateCents !== undefined
          ? profile.hourlyRateCents
          : (contractor.hourlyRateCents ?? null),
      markupPercent:
        profile.markupPercent !== undefined
          ? profile.markupPercent
          : (contractor.markupPercent ?? null),
      currencyCode: profile.currencyCode !== undefined ? profile.currencyCode : contractor.currencyCode,
      unitSystem: profile.unitSystem !== undefined ? profile.unitSystem : contractor.unitSystem,
      vatPercent: profile.vatPercent !== undefined ? profile.vatPercent : contractor.vatPercent,
      countryCode: profile.countryCode !== undefined ? profile.countryCode : contractor.countryCode,
    });
    await SecureStore.setItemAsync(KEYS.CONTRACTOR, JSON.stringify(updated));
    set({ contractor: updated });
  },

  async setOnboardingComplete(profile: {
    trade: string;
    hourlyRateCents?: number | null;
    markupPercent?: number | null;
  }): Promise<void> {
    await SecureStore.setItemAsync(KEYS.ONBOARDING_COMPLETE, 'true');
    const contractor = get().contractor;
    if (contractor) {
      const updated: Contractor = withLocale({
        ...contractor,
        trade: profile.trade,
        hourlyRateCents:
          profile.hourlyRateCents !== undefined
            ? profile.hourlyRateCents
            : (contractor.hourlyRateCents ?? null),
        markupPercent:
          profile.markupPercent !== undefined
            ? profile.markupPercent
            : (contractor.markupPercent ?? null),
      });
      await SecureStore.setItemAsync(KEYS.CONTRACTOR, JSON.stringify(updated));
      set({ onboardingComplete: true, contractor: updated });
    } else {
      set({ onboardingComplete: true });
    }
  },
}));
