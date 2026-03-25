export interface ContractorPayload {
  contractorId: string;
  email: string | null;
  phone: string | null;
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
