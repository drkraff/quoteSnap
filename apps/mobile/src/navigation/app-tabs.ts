/** Expo Router hides a Tabs.Screen from the tab bar when href is null. */
export const HIDDEN_TAB_HREF = null;

/**
 * Visible product tabs (A-19). Home is not a surface — logout lives in the
 * nav header. Keep in sync with Tabs.Screen `name`s that should appear.
 */
export const APP_TAB_BAR_SCREEN_NAMES = ['quotes', 'catalog'] as const;

export const LOGOUT_HEADER_LABEL = 'Log Out';

export function isHiddenAppIndex(segments: readonly string[]): boolean {
  return segments[0] === '(app)' && (segments[1] === undefined || segments[1] === 'index');
}

/** `undefined` keeps the default tab item; `null` hides it. */
export function tabBarHref(name: string): null | undefined {
  return (APP_TAB_BAR_SCREEN_NAMES as readonly string[]).includes(name)
    ? undefined
    : HIDDEN_TAB_HREF;
}
