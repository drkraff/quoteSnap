import {
  APP_TAB_BAR_SCREEN_NAMES,
  HIDDEN_TAB_HREF,
  LOGOUT_HEADER_LABEL,
  isHiddenAppIndex,
  tabBarHref,
} from './app-tabs';

describe('APP_TAB_BAR_SCREEN_NAMES', () => {
  it('is Quotes and Catalog only — Home is not a tab (A-19)', () => {
    expect([...APP_TAB_BAR_SCREEN_NAMES]).toEqual(['quotes', 'catalog']);
    expect(APP_TAB_BAR_SCREEN_NAMES).not.toContain('index');
    expect(APP_TAB_BAR_SCREEN_NAMES).not.toContain('home');
  });
});

describe('HIDDEN_TAB_HREF', () => {
  it('is the Expo Router value that omits a screen from the tab bar', () => {
    expect(HIDDEN_TAB_HREF).toBeNull();
  });
});

describe('LOGOUT_HEADER_LABEL', () => {
  it('keeps AUTH-03 logout copy without a Settings app', () => {
    expect(LOGOUT_HEADER_LABEL).toBe('Log Out');
  });
});

describe('isHiddenAppIndex', () => {
  it('treats bare /(app) and index as the former Home stub', () => {
    expect(isHiddenAppIndex(['(app)'])).toBe(true);
    expect(isHiddenAppIndex(['(app)', 'index'])).toBe(true);
  });

  it('does not treat Quotes or Catalog as the hidden index', () => {
    expect(isHiddenAppIndex(['(app)', 'quotes'])).toBe(false);
    expect(isHiddenAppIndex(['(app)', 'catalog'])).toBe(false);
    expect(isHiddenAppIndex(['(auth)', 'login'])).toBe(false);
  });
});

describe('tabBarHref', () => {
  it('shows Quotes and Catalog and hides Home/index', () => {
    expect(tabBarHref('quotes')).toBeUndefined();
    expect(tabBarHref('catalog')).toBeUndefined();
    expect(tabBarHref('index')).toBeNull();
    expect(tabBarHref('draft/[id]')).toBeNull();
  });
});
