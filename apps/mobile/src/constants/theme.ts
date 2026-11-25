import { Platform } from 'react-native';

/** Salon Staff palette. Deep berry brand on warm neutrals. */
export const Colors = {
  light: {
    brand: '#9d174d',
    brandPressed: '#831843',
    brandSoft: '#fce7f3',
    onBrand: '#ffffff',
    background: '#faf7f5',
    surface: '#ffffff',
    surfaceMuted: '#f3eeea',
    border: '#e7e0da',
    text: '#1c1917',
    textSecondary: '#57534e',
    textMuted: '#8a817a',
    success: '#15803d',
    successSoft: '#dcfce7',
    warning: '#b45309',
    warningSoft: '#fef3c7',
    danger: '#b91c1c',
    dangerSoft: '#fee2e2',
    info: '#1d4ed8',
    infoSoft: '#dbeafe',
  },
  dark: {
    brand: '#f472b6',
    brandPressed: '#ec4899',
    brandSoft: '#3b1326',
    onBrand: '#1c1917',
    background: '#141110',
    surface: '#1f1b19',
    surfaceMuted: '#2a2522',
    border: '#3a3330',
    text: '#f5f1ee',
    textSecondary: '#c9c1bb',
    textMuted: '#968c85',
    success: '#4ade80',
    successSoft: '#12301d',
    warning: '#fbbf24',
    warningSoft: '#3a2a0c',
    danger: '#f87171',
    dangerSoft: '#3b1414',
    info: '#93c5fd',
    infoSoft: '#172554',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof ThemeColors;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;
