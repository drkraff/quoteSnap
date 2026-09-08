/** Quotes is the contractor-facing product surface (A-12). Not the Home stub. */
export const AUTHENTICATED_ENTRY_HREF = '/(app)/quotes' as const;

export const LOGIN_HREF = '/(auth)/login' as const;

export const ONBOARDING_HREF = '/(auth)/onboarding/trade-selection' as const;

export type SessionRedirectHref =
  | typeof AUTHENTICATED_ENTRY_HREF
  | typeof LOGIN_HREF
  | typeof ONBOARDING_HREF;

/**
 * Auth-gated destination for the root layout. Returns null when the current
 * segment group is already correct (stay put).
 */
export function resolveSessionRedirect(args: {
  isAuthenticated: boolean;
  onboardingComplete: boolean;
  segments: readonly string[];
}): SessionRedirectHref | null {
  const inAuthGroup = args.segments[0] === '(auth)';
  const inAppGroup = args.segments[0] === '(app)';
  const inOnboarding = args.segments[1] === 'onboarding';

  if (!args.isAuthenticated) {
    return inAuthGroup ? null : LOGIN_HREF;
  }

  if (!args.onboardingComplete) {
    if (inAuthGroup && inOnboarding) {
      return null;
    }
    return ONBOARDING_HREF;
  }

  if (inAppGroup) {
    return null;
  }

  return AUTHENTICATED_ENTRY_HREF;
}
