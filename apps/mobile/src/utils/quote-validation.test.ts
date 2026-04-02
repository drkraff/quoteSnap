import { canSend } from './quote-validation';

describe('canSend', () => {
  it('returns false when there are no items', () => {
    expect(canSend(0, '5551234567')).toBe(false);
  });

  it('returns false when phone is empty', () => {
    expect(canSend(1, '')).toBe(false);
  });

  it('returns false when phone is too short (less than 10 digits)', () => {
    expect(canSend(1, '555123')).toBe(false);
  });

  it('returns true when items present and phone has 10 digits', () => {
    expect(canSend(1, '5551234567')).toBe(true);
  });

  it('returns true when phone has formatting characters and 10+ digits', () => {
    expect(canSend(1, '(555) 123-4567')).toBe(true);
  });

  it('returns true for multiple items and valid phone', () => {
    expect(canSend(3, '5551234567')).toBe(true);
  });

  it('returns false for phone with 9 digits after stripping', () => {
    expect(canSend(1, '555123456')).toBe(false);
  });
});
