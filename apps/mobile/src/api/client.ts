import Constants from 'expo-constants';

const API_BASE_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://10.0.2.2:3000';

interface ApiError {
  status: number;
  error: string;
}

function isApiError(value: unknown): value is { error: string } {
  return typeof value === 'object' && value !== null && 'error' in value;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retrying = false,
): Promise<T> {
  // Lazy import to avoid circular dependency at module load time
  const { useAuthStore } = await import('../store/auth-store');
  const accessToken = useAuthStore.getState().accessToken;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && !retrying) {
    // Attempt token refresh
    const refreshed = await useAuthStore.getState().refreshSession();
    if (refreshed) {
      return request<T>(method, path, body, true);
    } else {
      await useAuthStore.getState().logout();
      const apiError: ApiError = { status: 401, error: 'Session expired' };
      throw apiError;
    }
  }

  const data: unknown = response.status === 204 ? undefined : await response.json();

  if (!response.ok) {
    const errorMessage = isApiError(data) ? data.error : response.statusText;
    const apiError: ApiError = { status: response.status, error: errorMessage };
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
};
