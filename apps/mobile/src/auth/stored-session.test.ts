import { accessTokenExpired, parseStoredContractor } from './stored-session';

function jwtWithExp(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp, sub: 'contractor-1' })).toString('base64url');
  return `${header}.${payload}.sig`;
}

describe('accessTokenExpired', () => {
  const expSeconds = 1_700_000_000;

  it('expires at exp and not one millisecond earlier', () => {
    const token = jwtWithExp(expSeconds);
    expect(accessTokenExpired(token, expSeconds * 1000 - 1)).toBe(false);
    expect(accessTokenExpired(token, expSeconds * 1000)).toBe(true);
    expect(accessTokenExpired(token, expSeconds * 1000 + 5_000)).toBe(true);
  });

  it('does not force refresh for an unreadable token', () => {
    expect(accessTokenExpired('not-a-jwt', Date.now())).toBe(false);
    expect(accessTokenExpired(null, Date.now())).toBe(false);
    expect(accessTokenExpired('', Date.now())).toBe(false);
  });
});

describe('parseStoredContractor', () => {
  it('rejects corrupt JSON and a contractor with no id', () => {
    expect(parseStoredContractor('{not-json')).toBeNull();
    expect(parseStoredContractor('null')).toBeNull();
    expect(parseStoredContractor(JSON.stringify({ email: 'ada@example.com' }))).toBeNull();
    expect(parseStoredContractor(JSON.stringify({ id: '  ' }))).toBeNull();
    expect(parseStoredContractor(JSON.stringify({ id: 'contractor-1' }))).toMatchObject({
      id: 'contractor-1',
    });
  });
});
