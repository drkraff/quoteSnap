import {
  credentialsFromIdentifier,
  normalizeAuthPhone,
  parseAuthIdentifier,
} from './auth-identifier';

describe('normalizeAuthPhone', () => {
  it('passes through valid E.164', () => {
    expect(normalizeAuthPhone('+15555550100')).toBe('+15555550100');
    expect(normalizeAuthPhone('+447911123456')).toBe('+447911123456');
  });

  it('strips formatting from an E.164 value', () => {
    expect(normalizeAuthPhone('+1 (555) 555-0100')).toBe('+15555550100');
  });

  it('assumes US +1 for a 10-digit number without a country code', () => {
    expect(normalizeAuthPhone('5555550100')).toBe('+15555550100');
    expect(normalizeAuthPhone('(555) 555-0100')).toBe('+15555550100');
    expect(normalizeAuthPhone('555-555-0100')).toBe('+15555550100');
  });

  it('treats 11-digit numbers starting with 1 as US with country code', () => {
    expect(normalizeAuthPhone('15555550100')).toBe('+15555550100');
    expect(normalizeAuthPhone('1 555 555 0100')).toBe('+15555550100');
  });

  it('prefixes + when 11–15 digits already include a country code', () => {
    expect(normalizeAuthPhone('447911123456')).toBe('+447911123456');
  });

  it('rejects too-short, too-long, and country codes starting with 0', () => {
    expect(normalizeAuthPhone('')).toBeNull();
    expect(normalizeAuthPhone('5551234')).toBeNull();
    expect(normalizeAuthPhone('+1555')).toBeNull();
    expect(normalizeAuthPhone('1234567890123456')).toBeNull();
    expect(normalizeAuthPhone('+05555550100')).toBeNull();
  });
});

describe('parseAuthIdentifier', () => {
  it('returns a trimmed email and never a phone when @ is present', () => {
    expect(parseAuthIdentifier('  ada@example.com  ')).toEqual({
      ok: true,
      identifier: { field: 'email', value: 'ada@example.com' },
    });
  });

  it('rejects a string with @ that is not a valid email', () => {
    expect(parseAuthIdentifier('not-an-email@')).toEqual({
      ok: false,
      error: 'Enter a valid email address.',
    });
  });

  it('normalizes a phone when there is no @', () => {
    expect(parseAuthIdentifier('(555) 555-0100')).toEqual({
      ok: true,
      identifier: { field: 'phone', value: '+15555550100' },
    });
    expect(parseAuthIdentifier('+1 555 555 0100')).toEqual({
      ok: true,
      identifier: { field: 'phone', value: '+15555550100' },
    });
  });

  it('rejects blank and unusable values', () => {
    expect(parseAuthIdentifier('   ')).toEqual({
      ok: false,
      error: 'Email or phone is required.',
    });
    expect(parseAuthIdentifier('123')).toEqual({
      ok: false,
      error: 'Enter a valid email or phone number.',
    });
  });
});

describe('credentialsFromIdentifier', () => {
  it('sends only email when the identifier is email (email-wins / no mixed payload)', () => {
    expect(
      credentialsFromIdentifier({ field: 'email', value: 'ada@example.com' }, 'secret12'),
    ).toEqual({ email: 'ada@example.com', password: 'secret12' });
  });

  it('sends only the E.164 phone when the identifier is phone', () => {
    expect(
      credentialsFromIdentifier({ field: 'phone', value: '+15555550100' }, 'secret12'),
    ).toEqual({ phone: '+15555550100', password: 'secret12' });
  });
});
