import * as SecureStore from 'expo-secure-store';
import { resetApiClientForTests } from './client';
import { getDraftLineItems, getVoiceStatus, uploadAudio } from './voice';
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

function fetchCalls(): { path: string; init?: RequestInit }[] {
  return (global.fetch as jest.Mock).mock.calls.map(([input, init]: [RequestInfo | URL, RequestInit?]) => ({
    path: requestPath(input),
    init,
  }));
}

function headerRecord(init?: RequestInit): Record<string, string> {
  const raw = init?.headers;
  if (!raw) {
    return {};
  }
  if (raw instanceof Headers) {
    const out: Record<string, string> = {};
    raw.forEach((value: string, key: string) => {
      out[key.toLowerCase()] = value;
    });
    return out;
  }
  return Object.fromEntries(
    Object.entries(raw as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function formDataHas(body: unknown, key: string): boolean {
  if (typeof FormData !== 'undefined' && body instanceof FormData && typeof body.has === 'function') {
    return body.has(key);
  }
  const parts = (body as { _parts?: [string, unknown][] })._parts;
  if (Array.isArray(parts)) {
    return parts.some(([name]) => name === key);
  }
  return false;
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

describe('voice API uses apiClient refresh', () => {
  beforeEach(() => {
    resetApiClientForTests();
    useAuthStore.setState({
      ...initialState,
      accessToken: 'expired-access',
      refreshToken: 'valid-refresh',
      contractor,
      isAuthenticated: true,
      isLoading: false,
    });
    jest.mocked(SecureStore.setItemAsync).mockClear();
    jest.mocked(SecureStore.getItemAsync).mockClear();
    jest.mocked(SecureStore.deleteItemAsync).mockClear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    resetApiClientForTests();
    global.fetch = originalFetch;
  });

  it('refreshes and retries uploadAudio with the same FormData body', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }, 'Unauthorized'))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh' }),
      )
      .mockResolvedValueOnce(jsonResponse(202, { jobId: 'job-1', quoteId: 'quote-1' }));

    await expect(uploadAudio('file:///recordings/job.m4a', 'quote-server-1')).resolves.toEqual({
      jobId: 'job-1',
      quoteId: 'quote-1',
    });

    const calls = fetchCalls();
    expect(calls.map((call) => call.path)).toEqual([
      '/voice/upload',
      '/auth/refresh',
      '/voice/upload',
    ]);

    const firstBody = calls[0]?.init?.body;
    const retryBody = calls[2]?.init?.body;
    expect(firstBody).toBe(retryBody);
    expect(formDataHas(firstBody, 'audio')).toBe(true);
    expect(formDataHas(firstBody, 'quoteServerId')).toBe(true);
    expect(headerRecord(calls[0]?.init)['content-type']).toBeUndefined();
    expect(headerRecord(calls[2]?.init)).toMatchObject({
      authorization: 'Bearer new-access',
    });
    expect(headerRecord(calls[2]?.init)['content-type']).toBeUndefined();
    expect(useAuthStore.getState().accessToken).toBe('new-access');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('refreshes and retries getVoiceStatus with the new access token', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }, 'Unauthorized'))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { status: 'processing' }));

    await expect(getVoiceStatus('job-99')).resolves.toEqual({ status: 'processing' });

    const calls = fetchCalls();
    expect(calls.map((call) => call.path)).toEqual([
      '/voice/status/job-99',
      '/auth/refresh',
      '/voice/status/job-99',
    ]);
    expect(headerRecord(calls[0]?.init)).toMatchObject({
      authorization: 'Bearer expired-access',
    });
    expect(headerRecord(calls[2]?.init)).toMatchObject({
      authorization: 'Bearer new-access',
    });
    expect(useAuthStore.getState().accessToken).toBe('new-access');
  });

  it('refreshes and retries getDraftLineItems with the new access token', async () => {
    const draft = {
      quoteId: 'quote-1',
      totalCents: 1500,
      lineItems: [],
    };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }, 'Unauthorized'))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, draft));

    await expect(getDraftLineItems('quote-1')).resolves.toEqual(draft);

    const calls = fetchCalls();
    expect(calls.map((call) => call.path)).toEqual([
      '/voice/draft/quote-1',
      '/auth/refresh',
      '/voice/draft/quote-1',
    ]);
    expect(headerRecord(calls[2]?.init)).toMatchObject({
      authorization: 'Bearer new-access',
    });
    expect(useAuthStore.getState().accessToken).toBe('new-access');
  });

  it('does not treat a voice 401 refresh as an /auth interceptor skip', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }, 'Unauthorized'))
      .mockResolvedValueOnce(
        jsonResponse(401, { error: 'Invalid or expired refresh token' }, 'Unauthorized'),
      )
      .mockResolvedValueOnce(jsonResponse(200, { message: 'Logged out' }));

    await expect(getVoiceStatus('job-99')).rejects.toMatchObject({
      status: 401,
      error: 'Session expired',
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(fetchCalls().map((call) => call.path)).toEqual([
      '/voice/status/job-99',
      '/auth/refresh',
      '/auth/logout',
    ]);
  });

  it('surfaces quoteId from a 500 so the queue can stamp serverId before retry', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(
        500,
        { error: 'Internal server error', quoteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
        'Internal Server Error',
      ),
    );

    await expect(uploadAudio('file:///recordings/job.m4a')).rejects.toMatchObject({
      status: 500,
      error: 'Internal server error',
      quoteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
  });
});
