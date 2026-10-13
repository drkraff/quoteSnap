/**
 * Dark theme. One warm accent, used only for the primary action.
 * Page is near-black; cards and bubbles sit one step lighter.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

export const colors = {
  dominant: '#141414',
  secondary: '#2a2a2a',
  text: '#ffffff',
  accent: '#ff6b2c',
  destructive: '#e35d5d',
  destructivePressed: '#c44b4b',
  warning: '#d4a056',
  mutedText: '#9a9a9a',
  border: '#3a3a3a',
  borderFocused: '#ff6b2c',
  errorText: '#e35d5d',
  success: '#7dcea0',
} as const;

export const radius = {
  card: 22,
  pill: 28,
  icon: 22,
} as const;

export const typography = {
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  label: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  heading: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  display: { fontSize: 20, fontWeight: '700' as const, lineHeight: 26 },
} as const;

export const MIN_TOUCH_TARGET = 44;
