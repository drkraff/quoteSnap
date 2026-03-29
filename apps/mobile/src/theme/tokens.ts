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
  dominant: '#ffffff',
  secondary: '#f5f5f5',
  accent: '#0066cc',
  destructive: '#dc2626',
  destructivePressed: '#b91c1c',
  warning: '#b45309',
  mutedText: '#666666',
  border: '#cccccc',
  borderFocused: '#0066cc',
  errorText: '#dc2626',
} as const;

export const typography = {
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  label: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  heading: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
} as const;

export const MIN_TOUCH_TARGET = 44;
