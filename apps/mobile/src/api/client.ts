import Constants from 'expo-constants';

const API_BASE_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://10.0.2.2:3000';

export interface ApiError {
  status: number;
  error: string;
  /** Present on POST /voice/upload 500s after a quote row exists. */
  quoteId?: string;
}

function hasErrorMessage(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'string'
  );
}

function optionalQuoteId(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('quoteId' in data)) {
    return undefined;
  }
  const value = (data as { quoteId: unknown }).quoteId;
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isApiError(value: unknown): value is ApiError {
  return (
    hasErrorMessage(value) &&
    'status' in value &&
    typeof (value as { status: unknown }).status === 'number'
  );
}

export function isUnauthorizedError(value: unknown): value is ApiError {
  return isApiError(value) && value.status === 401;
}

export function isConflictError(value: unknown): value is ApiError {
  return isApiError(value) && value.status === 409;
}

function isAuthPath(path: string): boolean {
  return path === '/auth' || path.startsWith('/auth/');
}

/**
 * Multipart bodies must not be JSON.stringified, and must not set
 * Content-Type: application/json (that hides the multipart boundary the
 * runtime attaches). RN FormData may fail `instanceof` across bundles, so
 * also accept the `_parts` shape used by React Native's FormData.
 */
function isFormDataBody(body: unknown): body is FormData {
  if (body == null) {
    return false;
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return true;
  }
  return (
    typeof body === 'object' &&
    typeof (body as { append?: unknown }).append === 'function' &&
    Array.isArray((body as { _parts?: unknown })._parts)
  );
}

function loadAuthStore(): typeof import('../store/auth-store') {
  // Lazy require avoids the auth-store → auth → client cycle at module load.
  // Dynamic import() is not available under jest-expo without vm-modules.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../store/auth-store') as typeof import('../store/auth-store');
}

// Shared refresh promise — concurrent resource 401s coalesce into one refresh attempt
let refreshPromise: Promise<boolean> | null = null;

function getOrRefreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    // Assign synchronously before any await so concurrent callers share this promise
    const { useAuthStore } = loadAuthStore();
    refreshPromise = useAuthStore.getState().refreshSession().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export function resetApiClientForTests(): void {
  refreshPromise = null;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retrying = false,
): Promise<T> {
  const { useAuthStore } = loadAuthStore();
  const accessToken = useAuthStore.getState().accessToken;
  const formBody = isFormDataBody(body);

  const headers: Record<string, string> = {};
  if (!formBody) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let serializedBody: BodyInit | undefined;
  if (body !== undefined) {
    serializedBody = formBody ? body : JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: serializedBody,
  });

  // Login/register/refresh/logout 401s are credential or token-body failures.
  // Running the resource interceptor here maps them to "Session expired" and can
  // deadlock when /auth/refresh 401s while a refresh is already in flight.
  if (response.status === 401 && !retrying && !isAuthPath(path)) {
    const refreshed = await getOrRefreshSession();
    if (refreshed) {
      return request<T>(method, path, body, true);
    }
    await useAuthStore.getState().logout();
    const apiError: ApiError = { status: 401, error: 'Session expired' };
    throw apiError;
  }

  const data: unknown = response.status === 204 ? undefined : await response.json();

  if (!response.ok) {
    const errorMessage = hasErrorMessage(data) ? data.error : response.statusText;
    const apiError: ApiError = { status: response.status, error: errorMessage };
    const quoteId = optionalQuoteId(data);
    if (quoteId) {
      apiError.quoteId = quoteId;
    }
    throw apiError;
  }

  return data as T;
}

export const apiClient = {
  get<T>(path: string): Promise<T> {
    return request<T>('GET', path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('POST', path, body);
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('PUT', path, body);
  },
  delete<T>(path: string): Promise<T> {
    return request<T>('DELETE', path);
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('PATCH', path, body);
  },
};
