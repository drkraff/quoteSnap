import * as SecureStore from 'expo-secure-store';
import { apiClient, resetApiClientForTests } from './client';
import { useAuthStore } from '../store/auth-store';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

const contractor = {
  id: 'contractor-1',
  email: 'ada@example.com',
  phone: null,
  displayName: 'Ada',
  trade: 'plumbing',
};

function jsonResponse(status: number, body: unknown, statusText = 'Error'): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

function requestPath(input: RequestInfo | URL): string {
  const url = String(input);
  const protocol = url.indexOf('://');
  const fromHost = protocol === -1 ? url : url.slice(protocol + 3);
  const slash = fromHost.indexOf('/');
  return slash === -1 ? '/' : fromHost.slice(slash);
}

function fetchCalls(): Array<{ path: string; init?: RequestInit }> {
  return (global.fetch as jest.Mock).mock.calls.map(([input, init]: [RequestInfo | URL, RequestInit?]) => ({
    path: requestPath(input),
    init,
  }));
}

const initialState = {
  contractor: null,
  accessToken: null,
  refreshToken: null,
  isLoading: true,
  isAuthenticated: false,
  onboardingComplete: false,
};

const originalFetch = global.fetch;

describe('apiClient auth vs resource 401 handling', () => {
  beforeEach(() => {
    resetApiClientForTests();
    useAuthStore.setState(initialState);
    jest.mocked(SecureStore.setItemAsync).mockClear();
    jest.mocked(SecureStore.getItemAsync).mockClear();
    jest.mocked(SecureStore.deleteItemAsync).mockClear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    resetApiClientForTests();
    global.fetch = originalFetch;
  });

  it('surfaces Invalid credentials on login 401 instead of Session expired', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(401, { error: 'Invalid credentials' }, 'Unauthorized'),
    );

    await expect(
      useAuthStore.getState().login({ email: 'ada@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ status: 401, error: 'Invalid credentials' });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(fetchCalls().map((call) => call.path)).toEqual(['/auth/login']);
  });

  it('does not run the session interceptor for /auth/login even when an access token exists', async () => {
    useAuthStore.setState({
      accessToken: 'stale-access',
      refreshToken: 'stale-refresh',
      contractor,
      isAuthenticated: true,
      isLoading: false,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(401, { error: 'Invalid credentials' }, 'Unauthorized'),
    );

    await expect(
      apiClient.post('/auth/login', { email: 'ada@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ status: 401, error: 'Invalid credentials' });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(fetchCalls().map((call) => call.path)).toEqual(['/auth/login']);
  });

  it('retries a resource request after a successful refresh', async () => {
    useAuthStore.setState({
      accessToken: 'expired-access',
      refreshToken: 'valid-refresh',
      contractor,
      isAuthenticated: true,
      isLoading: false,
    });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }, 'Unauthorized'))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { quotes: [] }));

    await expect(apiClient.get('/quotes')).resolves.toEqual({ quotes: [] });

    expect(useAuthStore.getState().accessToken).toBe('new-access');
    expect(useAuthStore.getState().refreshToken).toBe('new-refresh');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    const calls = fetchCalls();
    expect(calls.map((call) => call.path)).toEqual(['/quotes', '/auth/refresh', '/quotes']);
    expect(calls[2]?.init?.headers).toMatchObject({ Authorization: 'Bearer new-access' });
  });

  it('logs out with Session expired when /auth/refresh 401s and does not deadlock', async () => {
    useAuthStore.setState({
      accessToken: 'expired-access',
      refreshToken: 'dead-refresh',
      contractor,
      isAuthenticated: true,
      isLoading: false,
    });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }, 'Unauthorized'))
      .mockResolvedValueOnce(
        jsonResponse(401, { error: 'Invalid or expired refresh token' }, 'Unauthorized'),
      )
      .mockResolvedValueOnce(jsonResponse(200, { message: 'Logged out' }));

    await expect(apiClient.get('/quotes')).rejects.toMatchObject({
      status: 401,
      error: 'Session expired',
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(fetchCalls().map((call) => call.path)).toEqual([
      '/quotes',
      '/auth/refresh',
      '/auth/logout',
    ]);
  }, 1000);

  it('does not logout when refresh fails due to a network error', async () => {
    useAuthStore.setState({
      accessToken: 'expired-access',
      refreshToken: 'valid-refresh',
      contractor,
      isAuthenticated: true,
      isLoading: false,
    });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }, 'Unauthorized'))
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiClient.get('/quotes')).rejects.toThrow('Network request failed');

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().refreshToken).toBe('valid-refresh');
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(fetchCalls().map((call) => call.path)).toEqual(['/quotes', '/auth/refresh']);
  });
});
