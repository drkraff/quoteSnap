import { useAuthStore } from '../store/auth-store';
import { localeFromUnknown, type ContractorLocale } from './currency';

/** Israel defaults when a stored contractor has no locale yet. */
export function useContractorLocale(): ContractorLocale {
  const contractor = useAuthStore((state) => state.contractor);
  return localeFromUnknown(contractor);
}
