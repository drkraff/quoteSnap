import {
  canFinishOnboarding,
  dollarsToCents,
  onboardingAfterProfile,
  parseMarkupPercentInput,
} from './profile';

describe('dollarsToCents', () => {
  it('parses dollar strings to integer cents', () => {
    expect(dollarsToCents('75')).toBe(7500);
    expect(dollarsToCents('$75.50')).toBe(7550);
    expect(dollarsToCents('1.5')).toBe(150);
    expect(dollarsToCents('1.05')).toBe(105);
  });

  it('rejects zero, blank, and extra decimals', () => {
    expect(dollarsToCents('')).toBeNull();
    expect(dollarsToCents('0')).toBeNull();
    expect(dollarsToCents('75.505')).toBeNull();
    expect(dollarsToCents('abc')).toBeNull();
  });
});

describe('parseMarkupPercentInput', () => {
  it('treats empty as omitted and accepts 0-100 integers', () => {
    expect(parseMarkupPercentInput('')).toEqual({ ok: true, value: null });
    expect(parseMarkupPercentInput('20')).toEqual({ ok: true, value: 20 });
    expect(parseMarkupPercentInput('20%')).toEqual({ ok: true, value: 20 });
    expect(parseMarkupPercentInput('0')).toEqual({ ok: true, value: 0 });
    expect(parseMarkupPercentInput('101')).toEqual({ ok: false });
  });
});

describe('canFinishOnboarding / skip catalog', () => {
  it('requires trade + hourly and does not require a catalog seed', () => {
    expect(
      canFinishOnboarding({ trade: null, hourlyRateCents: 7500, markupOk: true }),
    ).toBe(false);
    expect(
      canFinishOnboarding({ trade: 'plumbing', hourlyRateCents: null, markupOk: true }),
    ).toBe(false);
    expect(
      canFinishOnboarding({ trade: 'plumbing', hourlyRateCents: 7500, markupOk: false }),
    ).toBe(false);
    expect(
      canFinishOnboarding({ trade: 'plumbing', hourlyRateCents: 7500, markupOk: true }),
    ).toBe(true);
  });

  it('skip_catalog goes to ready with zero items and does not route to seed', () => {
    expect(onboardingAfterProfile('skip_catalog', 'plumbing')).toEqual({
      kind: 'ready',
      trade: 'plumbing',
      itemCount: 0,
    });
    expect(onboardingAfterProfile('load_catalog', 'electrical')).toEqual({
      kind: 'seed',
      trade: 'electrical',
    });
    expect(
      onboardingAfterProfile('import_quotes', 'hvac'),
    ).toEqual({
      kind: 'import',
      trade: 'hvac',
      itemCount: 0,
    });
  });

  it('skip catalog still finishes onboarding so quote create is not blocked', () => {
    expect(
      canFinishOnboarding({ trade: 'hvac', hourlyRateCents: 9000, markupOk: true }),
    ).toBe(true);
    expect(onboardingAfterProfile('skip_catalog', 'hvac')).toEqual({
      kind: 'ready',
      trade: 'hvac',
      itemCount: 0,
    });
  });
});
