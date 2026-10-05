export const SEEDING_BLOCKED_TITLE = "Catalog setup didn't finish";

export const SEEDING_BLOCKED_BODY =
  "We couldn't tell which account this is. Try again, or skip and quote without a starter catalog.";

export const SEEDING_RETRY_LABEL = 'Try again';

export const SEEDING_SKIP_LABEL = 'Skip for now';

/** Null when there is no contractor id. Never throws. */
export function seedingContractorId(
  contractor: { id?: unknown } | null | undefined,
): string | null {
  const id = contractor?.id;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed === '' ? null : trimmed;
}

export function seedingReadyHref(
  trade: string | undefined,
  itemCount: number,
): { pathname: '/(auth)/onboarding/ready'; params: { trade: string; itemCount: string } } {
  return {
    pathname: '/(auth)/onboarding/ready',
    params: { trade: trade ?? '', itemCount: String(itemCount) },
  };
}
