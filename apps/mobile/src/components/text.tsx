import { StyleSheet, Text as RNText, type TextProps } from 'react-native';

import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'small'
  | 'smallStrong'
  | 'caption'
  | 'overline';

export type ThemedTextProps = TextProps & {
  variant?: TextVariant;
  color?: ThemeColor;
};

export function Text({ variant = 'body', color = 'text', style, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return <RNText style={[styles[variant], { color: theme[color] }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  subheading: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20 },
  smallStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
