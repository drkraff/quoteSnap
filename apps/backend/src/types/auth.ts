export interface ContractorPayload {
  contractorId: string;
  email: string | null;
  phone: string | null;
}

/** Public contractor fields returned by auth and onboarding profile. */
export interface ContractorPublic {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  trade: string | null;
  hourlyRateCents: number | null;
  markupPercent: number | null;
}

export interface RegisterBody {
  email?: string;
  phone?: string;
  password: string;
  displayName?: string;
}

export interface LoginBody {
  email?: string;
  phone?: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshBody {
  refreshToken: string;
}

export interface LogoutBody {
  refreshToken: string;
}
