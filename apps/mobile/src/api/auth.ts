import { apiClient } from './client';

export interface ContractorResponse {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  trade: string | null;
}

export interface AuthResponse {
  contractor: ContractorResponse;
  accessToken: string;
  refreshToken: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

export async function register(params: {
  email?: string;
  phone?: string;
  password: string;
  displayName?: string;
}): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/register', params);
}

export async function login(params: {
  email?: string;
  phone?: string;
  password: string;
}): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/login', params);
}

export async function refresh(refreshToken: string): Promise<TokenResponse> {
  return apiClient.post<TokenResponse>('/auth/refresh', { refreshToken });
}

export async function logout(refreshToken: string): Promise<void> {
  return apiClient.post<void>('/auth/logout', { refreshToken });
}
