import * as SecureStore from 'expo-secure-store';
import * as authApi from '../api/auth';
import { useAuthStore } from './auth-store';

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

const contractor = {
  id: 'contractor-1',
  email: 'ada@example.com',
  phone: null,
  displayName: 'Ada',
  trade: 'plumbing',
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
    useAuthStore.setState(initialState);
    jest.mocked(authApi.refresh).mockReset();
    jest.mocked(authApi.logout).mockReset();
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
  });
});
