import * as SecureStore from 'expo-secure-store';
import * as authApi from '../api/auth';
import { hydrateFromServer } from '../sync/hydrate';
import { retainQueuedWorkForContractor } from '../sync/sync-queue';
import { resetAuthSessionForTests, useAuthStore } from './auth-store';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../api/auth', () => ({
  login: jest.fn(),
  register: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
}));

jest.mock('../sync/hydrate', () => ({
  hydrateFromServer: jest.fn(() => Promise.resolve()),
}));

jest.mock('../sync/sync-queue', () => ({
  retainQueuedWorkForContractor: jest.fn(() => Promise.resolve()),
}));

const contractor = {
  id: 'contractor-1',
  email: 'ada@example.com',
  phone: null,
  displayName: 'Ada',
  trade: 'plumbing',
  hourlyRateCents: 7500,
  markupPercent: 20,
};

const KEYS = {
  ACCESS_TOKEN: 'quotesnap_access_token',
  REFRESH_TOKEN: 'quotesnap_refresh_token',
  CONTRACTOR: 'quotesnap_contractor',
  ONBOARDING_COMPLETE: 'quotesnap_onboarding_complete',
} as const;

const initialState = {
  contractor: null,
  accessToken: null,
  refreshToken: null,
  isLoading: true,
  isAuthenticated: false,
  onboardingComplete: false,
};

describe('auth-store refreshSession', () => {
  beforeEach(() => {
    resetAuthSessionForTests();
    useAuthStore.setState(initialState);
    jest.mocked(authApi.refresh).mockReset();
    jest.mocked(authApi.logout).mockReset();
    jest.mocked(authApi.login).mockReset();
    jest.mocked(authApi.register).mockReset();
    jest.mocked(hydrateFromServer).mockReset();
    jest.mocked(hydrateFromServer).mockResolvedValue(undefined);
    jest.mocked(SecureStore.setItemAsync).mockClear();
    jest.mocked(SecureStore.getItemAsync).mockReset();
    jest.mocked(SecureStore.deleteItemAsync).mockClear();
  });

  it('persists rotated tokens when contractor is still null', async () => {
    useAuthStore.setState({ refreshToken: 'old-refresh', contractor: null });
    jest.mocked(authApi.refresh).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });

    await expect(useAuthStore.getState().refreshSession()).resolves.toBe(true);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(KEYS.ACCESS_TOKEN, 'new-access');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(KEYS.REFRESH_TOKEN, 'new-refresh');
    expect(useAuthStore.getState().accessToken).toBe('new-access');
    expect(useAuthStore.getState().refreshToken).toBe('new-refresh');
  });

  it('returns false when the refresh token is rejected with 401', async () => {
    useAuthStore.setState({ refreshToken: 'dead-refresh' });
    jest.mocked(authApi.refresh).mockRejectedValue({
      status: 401,
      error: 'Invalid or expired refresh token',
    });

    await expect(useAuthStore.getState().refreshSession()).resolves.toBe(false);
    expect(useAuthStore.getState().refreshToken).toBe('dead-refresh');
  });

  it('rethrows transport errors instead of treating them as a rejected session', async () => {
    useAuthStore.setState({ refreshToken: 'valid-refresh' });
    jest.mocked(authApi.refresh).mockRejectedValue(new TypeError('Network request failed'));

    await expect(useAuthStore.getState().refreshSession()).rejects.toThrow(
      'Network request failed',
    );
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('restoreSession persists rotated tokens when the access token is missing', async () => {
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key: string) => {
      switch (key) {
        case KEYS.ACCESS_TOKEN:
          return null;
        case KEYS.REFRESH_TOKEN:
          return 'old-refresh';
        case KEYS.CONTRACTOR:
          return JSON.stringify(contractor);
        case KEYS.ONBOARDING_COMPLETE:
          return 'true';
        default:
          return null;
      }
    });
    jest.mocked(authApi.refresh).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });

    await useAuthStore.getState().restoreSession();

    expect(authApi.refresh).toHaveBeenCalledWith('old-refresh');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(KEYS.ACCESS_TOKEN, 'new-access');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(KEYS.REFRESH_TOKEN, 'new-refresh');
    expect(useAuthStore.getState()).toMatchObject({
      contractor,
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      isAuthenticated: true,
      isLoading: false,
      onboardingComplete: true,
    });
    expect(hydrateFromServer).toHaveBeenCalledWith(contractor.id);
  });

  it('restoreSession keeps the local session when refresh fails over the network', async () => {
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key: string) => {
      switch (key) {
        case KEYS.ACCESS_TOKEN:
          return null;
        case KEYS.REFRESH_TOKEN:
          return 'valid-refresh';
        case KEYS.CONTRACTOR:
          return JSON.stringify(contractor);
        case KEYS.ONBOARDING_COMPLETE:
          return 'true';
        default:
          return null;
      }
    });
    jest.mocked(authApi.refresh).mockRejectedValue(new TypeError('Network request failed'));

    await useAuthStore.getState().restoreSession();

    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(authApi.logout).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      contractor,
      refreshToken: 'valid-refresh',
      isAuthenticated: true,
      isLoading: false,
    });
    expect(hydrateFromServer).toHaveBeenCalledWith(contractor.id);
  });
});

describe('auth-store login/restore hydrate', () => {
  beforeEach(() => {
    resetAuthSessionForTests();
    useAuthStore.setState(initialState);
    jest.mocked(authApi.login).mockReset();
    jest.mocked(authApi.register).mockReset();
    jest.mocked(authApi.refresh).mockReset();
    jest.mocked(hydrateFromServer).mockReset();
    jest.mocked(hydrateFromServer).mockResolvedValue(undefined);
    jest.mocked(SecureStore.setItemAsync).mockClear();
    jest.mocked(SecureStore.getItemAsync).mockReset();
    jest.mocked(SecureStore.deleteItemAsync).mockClear();
  });

  it('pulls catalog and quotes after a successful login', async () => {
    jest.mocked(authApi.login).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      contractor,
    });

    await useAuthStore.getState().login({ email: 'ada@example.com', password: 'secret' });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().onboardingComplete).toBe(true);
    expect(hydrateFromServer).toHaveBeenCalledTimes(1);
    expect(hydrateFromServer).toHaveBeenCalledWith(contractor.id);
  });

  it('still logs in when hydrate fails (offline / empty local until next restore)', async () => {
    jest.mocked(authApi.login).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      contractor,
    });
    jest.mocked(hydrateFromServer).mockRejectedValue(new TypeError('Network request failed'));

    await expect(
      useAuthStore.getState().login({ email: 'ada@example.com', password: 'secret' }),
    ).resolves.toBeUndefined();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(hydrateFromServer).toHaveBeenCalledWith(contractor.id);
  });

  it('does not hydrate on register (onboarding seed writes the catalog)', async () => {
    jest.mocked(authApi.register).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      contractor: { ...contractor, trade: null, hourlyRateCents: null, markupPercent: null },
    });

    await useAuthStore.getState().register({
      email: 'ada@example.com',
      password: 'secret',
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(hydrateFromServer).not.toHaveBeenCalled();
  });

  it('persists hourly rate on the contractor without requiring a catalog', async () => {
    useAuthStore.setState({
      contractor: { ...contractor, trade: null, hourlyRateCents: null, markupPercent: null },
    });

    await useAuthStore.getState().updateContractorProfile({
      trade: 'electrical',
      hourlyRateCents: 12500,
      markupPercent: 15,
    });
    await useAuthStore.getState().setOnboardingComplete({
      trade: 'electrical',
      hourlyRateCents: 12500,
      markupPercent: 15,
    });

    expect(useAuthStore.getState().onboardingComplete).toBe(true);
    expect(useAuthStore.getState().contractor).toMatchObject({
      trade: 'electrical',
      hourlyRateCents: 12500,
      markupPercent: 15,
    });
  });

  it('pulls catalog and quotes after a successful session restore', async () => {
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key: string) => {
      switch (key) {
        case KEYS.ACCESS_TOKEN:
          return 'stored-access';
        case KEYS.REFRESH_TOKEN:
          return 'stored-refresh';
        case KEYS.CONTRACTOR:
          return JSON.stringify(contractor);
        case KEYS.ONBOARDING_COMPLETE:
          return 'true';
        default:
          return null;
      }
    });

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(hydrateFromServer).toHaveBeenCalledTimes(1);
    expect(hydrateFromServer).toHaveBeenCalledWith(contractor.id);
  });

  it('does not hydrate when restore finds no session', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(hydrateFromServer).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('clears a corrupt stored contractor instead of spinning or entering the app', async () => {
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key: string) => {
      switch (key) {
        case KEYS.ACCESS_TOKEN:
          return 'stored-access';
        case KEYS.REFRESH_TOKEN:
          return 'stored-refresh';
        case KEYS.CONTRACTOR:
          return '{not-json';
        case KEYS.ONBOARDING_COMPLETE:
          return 'true';
        default:
          return null;
      }
    });

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState()).toMatchObject({
      contractor: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
    expect(hydrateFromServer).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEYS.CONTRACTOR);
  });

  it('rejects a stored contractor with no id', async () => {
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key: string) => {
      switch (key) {
        case KEYS.ACCESS_TOKEN:
          return 'stored-access';
        case KEYS.REFRESH_TOKEN:
          return 'stored-refresh';
        case KEYS.CONTRACTOR:
          return JSON.stringify({ email: 'ada@example.com' });
        default:
          return null;
      }
    });

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(hydrateFromServer).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });
});

function jwtWithExp(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds, sub: 'contractor-1' })).toString(
    'base64url',
  );
  return `${header}.${payload}.sig`;
}

describe('auth-store restore expired access token', () => {
  beforeEach(() => {
    resetAuthSessionForTests();
    useAuthStore.setState(initialState);
    jest.mocked(authApi.refresh).mockReset();
    jest.mocked(authApi.logout).mockReset();
    jest.mocked(hydrateFromServer).mockReset();
    jest.mocked(hydrateFromServer).mockResolvedValue(undefined);
    jest.mocked(SecureStore.setItemAsync).mockClear();
    jest.mocked(SecureStore.getItemAsync).mockReset();
    jest.mocked(SecureStore.deleteItemAsync).mockClear();
  });

  it('refreshes an expired access token and logs out when refresh is rejected', async () => {
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key: string) => {
      switch (key) {
        case KEYS.ACCESS_TOKEN:
          return jwtWithExp(1_000);
        case KEYS.REFRESH_TOKEN:
          return 'old-refresh';
        case KEYS.CONTRACTOR:
          return JSON.stringify(contractor);
        case KEYS.ONBOARDING_COMPLETE:
          return 'true';
        default:
          return null;
      }
    });
    jest.mocked(authApi.refresh).mockRejectedValue({
      status: 401,
      error: 'Invalid or expired refresh token',
    });

    await useAuthStore.getState().restoreSession();

    expect(authApi.refresh).toHaveBeenCalledWith('old-refresh');
    expect(useAuthStore.getState()).toMatchObject({
      contractor: null,
      isAuthenticated: false,
      isLoading: false,
    });
    expect(hydrateFromServer).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it('keeps the local session when an expired access token cannot refresh offline', async () => {
    const expired = jwtWithExp(1_000);
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key: string) => {
      switch (key) {
        case KEYS.ACCESS_TOKEN:
          return expired;
        case KEYS.REFRESH_TOKEN:
          return 'valid-refresh';
        case KEYS.CONTRACTOR:
          return JSON.stringify(contractor);
        case KEYS.ONBOARDING_COMPLETE:
          return 'true';
        default:
          return null;
      }
    });
    jest.mocked(authApi.refresh).mockRejectedValue(new TypeError('Network request failed'));

    await useAuthStore.getState().restoreSession();

    expect(authApi.refresh).toHaveBeenCalledWith('valid-refresh');
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      contractor,
      accessToken: expired,
      refreshToken: 'valid-refresh',
      isAuthenticated: true,
      isLoading: false,
    });
    expect(hydrateFromServer).toHaveBeenCalledWith(contractor.id);
  });
});

describe('auth-store logout and overlapping restore', () => {
  const contractor2 = { ...contractor, id: 'contractor-2', email: 'bea@example.com' };

  beforeEach(() => {
    resetAuthSessionForTests();
    useAuthStore.setState({
      ...initialState,
      contractor,
      accessToken: 'live-access',
      refreshToken: 'live-refresh',
      isAuthenticated: true,
      isLoading: false,
      onboardingComplete: true,
    });
    jest.mocked(authApi.login).mockReset();
    jest.mocked(authApi.refresh).mockReset();
    jest.mocked(authApi.logout).mockReset();
    jest.mocked(hydrateFromServer).mockReset();
    jest.mocked(hydrateFromServer).mockResolvedValue(undefined);
    jest.mocked(retainQueuedWorkForContractor).mockReset();
    jest.mocked(retainQueuedWorkForContractor).mockResolvedValue(undefined);
    jest.mocked(SecureStore.setItemAsync).mockReset();
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
    jest.mocked(SecureStore.getItemAsync).mockReset();
    jest.mocked(SecureStore.deleteItemAsync).mockReset();
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
  });

  it('stays signed in when the queue owner stamp fails', async () => {
    jest.mocked(retainQueuedWorkForContractor).mockRejectedValue(new Error('stamp failed'));

    await useAuthStore.getState().logout();

    expect(retainQueuedWorkForContractor).toHaveBeenCalledWith(contractor.id);
    expect(authApi.logout).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      contractor,
      accessToken: 'live-access',
      refreshToken: 'live-refresh',
      isAuthenticated: true,
    });
  });

  it('stamps the queue before revoke and still signs out when later logout steps fail', async () => {
    const order: string[] = [];
    jest.mocked(retainQueuedWorkForContractor).mockImplementation(async () => {
      order.push('stamp');
    });
    jest.mocked(authApi.logout).mockImplementation(async () => {
      order.push('revoke');
      throw new Error('revoke failed');
    });
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async () => {
      order.push('clear');
      throw new Error('clear failed');
    });

    await useAuthStore.getState().logout();

    expect(order[0]).toBe('stamp');
    expect(order).toContain('revoke');
    expect(order).toContain('clear');
    expect(retainQueuedWorkForContractor).toHaveBeenCalledWith(contractor.id);
    expect(useAuthStore.getState()).toMatchObject({
      contractor: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('does not let an in-flight restore replace a login that won', async () => {
    let releaseReads: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key: string) => {
      await gate;
      switch (key) {
        case KEYS.ACCESS_TOKEN:
          return 'old-access';
        case KEYS.REFRESH_TOKEN:
          return 'old-refresh';
        case KEYS.CONTRACTOR:
          return JSON.stringify(contractor);
        case KEYS.ONBOARDING_COMPLETE:
          return 'true';
        default:
          return null;
      }
    });
    jest.mocked(authApi.login).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      contractor: contractor2,
    });

    const restore = useAuthStore.getState().restoreSession();
    await new Promise((resolve) => setImmediate(resolve));
    await useAuthStore.getState().login({ email: contractor2.email, password: 'secret' });
    releaseReads();
    await restore;

    expect(useAuthStore.getState()).toMatchObject({
      contractor: contractor2,
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      isAuthenticated: true,
    });
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('clears an unreadable SecureStore and logs out', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('Could not decrypt'));

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState()).toMatchObject({
      contractor: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEYS.ACCESS_TOKEN);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEYS.CONTRACTOR);
  });

  it('does not clear tokens when login wins while SecureStore read fails', async () => {
    let rejectReads: (err: Error) => void = () => {};
    const gate = new Promise<string>((_resolve, reject) => {
      rejectReads = reject;
    });
    jest.mocked(SecureStore.getItemAsync).mockImplementation(() => gate);
    jest.mocked(authApi.login).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      contractor: contractor2,
    });

    const restore = useAuthStore.getState().restoreSession();
    await new Promise((resolve) => setImmediate(resolve));
    await useAuthStore.getState().login({ email: contractor2.email, password: 'secret' });
    rejectReads(new Error('Could not decrypt'));
    await restore;

    expect(useAuthStore.getState()).toMatchObject({
      contractor: contractor2,
      accessToken: 'new-access',
      isAuthenticated: true,
    });
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('refreshes once when two restores overlap on an expired access token', async () => {
    const store = new Map<string, string>([
      [KEYS.ACCESS_TOKEN, jwtWithExp(1_000)],
      [KEYS.REFRESH_TOKEN, 'old-refresh'],
      [KEYS.CONTRACTOR, JSON.stringify(contractor)],
      [KEYS.ONBOARDING_COMPLETE, 'true'],
    ]);
    const refreshedAccess = jwtWithExp(4_000_000_000);
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key: string) => {
      return store.get(key) ?? null;
    });
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key: string, value: string) => {
      store.set(key, value);
    });
    jest.mocked(authApi.refresh).mockResolvedValue({
      accessToken: refreshedAccess,
      refreshToken: 'new-refresh',
    });

    await Promise.all([
      useAuthStore.getState().restoreSession(),
      useAuthStore.getState().restoreSession(),
    ]);

    expect(authApi.refresh).toHaveBeenCalledTimes(1);
    expect(authApi.refresh).toHaveBeenCalledWith('old-refresh');
    expect(useAuthStore.getState()).toMatchObject({
      contractor,
      accessToken: refreshedAccess,
      refreshToken: 'new-refresh',
      isAuthenticated: true,
      isLoading: false,
    });
  });
});
