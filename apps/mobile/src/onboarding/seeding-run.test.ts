import {
  SEEDING_BLOCKED_BODY,
  SEEDING_RETRY_LABEL,
  SEEDING_SKIP_LABEL,
  seedingContractorId,
  seedingReadyHref,
} from './seeding-run';

describe('seedingContractorId', () => {
  it('returns the id when a contractor is signed in', () => {
    expect(seedingContractorId({ id: 'contractor-1' })).toBe('contractor-1');
  });

  it('does not throw when the contractor is missing', () => {
    expect(seedingContractorId(null)).toBeNull();
    expect(seedingContractorId(undefined)).toBeNull();
    expect(seedingContractorId({})).toBeNull();
    expect(seedingContractorId({ id: '  ' })).toBeNull();
    expect(seedingContractorId({ id: 12 })).toBeNull();
  });
});

describe('seeding blocked copy', () => {
  it('offers retry and a skip path with no starter catalog', () => {
    expect(SEEDING_BLOCKED_BODY.toLowerCase()).toContain('try again');
    expect(SEEDING_RETRY_LABEL).toBe('Try again');
    expect(SEEDING_SKIP_LABEL).toBe('Skip for now');
    expect(seedingReadyHref('plumbing', 0)).toEqual({
      pathname: '/(auth)/onboarding/ready',
      params: { trade: 'plumbing', itemCount: '0' },
    });
    expect(SEEDING_BLOCKED_BODY.toLowerCase()).not.toContain('stack');
  });
});
