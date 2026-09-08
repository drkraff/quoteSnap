import {
  AUTHENTICATED_ENTRY_HREF,
  LOGIN_HREF,
  ONBOARDING_HREF,
  resolveSessionRedirect,
} from './authenticated-entry';

describe('AUTHENTICATED_ENTRY_HREF', () => {
  it('is the Quotes tab, not the Home stub', () => {
    expect(AUTHENTICATED_ENTRY_HREF).toBe('/(app)/quotes');
    expect(AUTHENTICATED_ENTRY_HREF).not.toBe('/(app)');
    expect(AUTHENTICATED_ENTRY_HREF).not.toBe('/(app)/index');
  });
});

describe('resolveSessionRedirect', () => {
  it('sends unauthenticated users to login when outside the auth group', () => {
    expect(
      resolveSessionRedirect({
        isAuthenticated: false,
        onboardingComplete: false,
        segments: [],
      }),
    ).toBe(LOGIN_HREF);
    expect(
      resolveSessionRedirect({
        isAuthenticated: false,
        onboardingComplete: false,
        segments: ['(app)', 'quotes'],
      }),
    ).toBe(LOGIN_HREF);
  });

  it('leaves unauthenticated users on auth screens', () => {
    expect(
      resolveSessionRedirect({
        isAuthenticated: false,
        onboardingComplete: false,
        segments: ['(auth)', 'login'],
      }),
    ).toBeNull();
  });

  it('sends authenticated users without onboarding to trade selection', () => {
    expect(
      resolveSessionRedirect({
        isAuthenticated: true,
        onboardingComplete: false,
        segments: [],
      }),
    ).toBe(ONBOARDING_HREF);
    expect(
      resolveSessionRedirect({
        isAuthenticated: true,
        onboardingComplete: false,
        segments: ['(app)', 'quotes'],
      }),
    ).toBe(ONBOARDING_HREF);
    expect(
      resolveSessionRedirect({
        isAuthenticated: true,
        onboardingComplete: false,
        segments: ['(auth)', 'login'],
      }),
    ).toBe(ONBOARDING_HREF);
  });

  it('does not bounce users already in onboarding screens', () => {
    expect(
      resolveSessionRedirect({
        isAuthenticated: true,
        onboardingComplete: false,
        segments: ['(auth)', 'onboarding', 'ready'],
      }),
    ).toBeNull();
  });

  it('lands completed sessions on Quotes, not Home', () => {
    expect(
      resolveSessionRedirect({
        isAuthenticated: true,
        onboardingComplete: true,
        segments: ['(auth)', 'onboarding', 'ready'],
      }),
    ).toBe(AUTHENTICATED_ENTRY_HREF);
    expect(
      resolveSessionRedirect({
        isAuthenticated: true,
        onboardingComplete: true,
        segments: ['(auth)', 'login'],
      }),
    ).toBe(AUTHENTICATED_ENTRY_HREF);
    expect(
      resolveSessionRedirect({
        isAuthenticated: true,
        onboardingComplete: true,
        segments: [],
      }),
    ).toBe(AUTHENTICATED_ENTRY_HREF);
  });

  it('does not redirect when already in the app group', () => {
    expect(
      resolveSessionRedirect({
        isAuthenticated: true,
        onboardingComplete: true,
        segments: ['(app)'],
      }),
    ).toBeNull();
    expect(
      resolveSessionRedirect({
        isAuthenticated: true,
        onboardingComplete: true,
        segments: ['(app)', 'quotes'],
      }),
    ).toBeNull();
  });
});
