import { confidenceTier } from './confidence';

describe('confidenceTier', () => {
  it('returns clean for undefined', () => {
    expect(confidenceTier(undefined)).toBe('clean');
  });
  it('returns clean for 0.85', () => {
    expect(confidenceTier(0.85)).toBe('clean');
  });
  it('returns clean for 0.90', () => {
    expect(confidenceTier(0.90)).toBe('clean');
  });
  it('returns clean for 1.0', () => {
    expect(confidenceTier(1.0)).toBe('clean');
  });
  it('returns review for 0.84', () => {
    expect(confidenceTier(0.84)).toBe('review');
  });
  it('returns review for 0.60', () => {
    expect(confidenceTier(0.60)).toBe('review');
  });
  it('returns review for 0.72', () => {
    expect(confidenceTier(0.72)).toBe('review');
  });
  it('returns needs_input for 0.59', () => {
    expect(confidenceTier(0.59)).toBe('needs_input');
  });
  it('returns needs_input for 0.0', () => {
    expect(confidenceTier(0.0)).toBe('needs_input');
  });
  it('returns needs_input for 0.30', () => {
    expect(confidenceTier(0.30)).toBe('needs_input');
  });
});
