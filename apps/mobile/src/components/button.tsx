import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  title: string;
  variant?: Variant;
  size?: 'md' | 'sm';
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
};

const COLORS: Record<Variant, { bg: ThemeColor | null; fg: ThemeColor; border: ThemeColor | null }> = {
  primary: { bg: 'brand', fg: 'onBrand', border: null },
  secondary: { bg: 'brandSoft', fg: 'brand', border: null },
  outline: { bg: 'surface', fg: 'text', border: 'border' },
  ghost: { bg: null, fg: 'brand', border: null },
  danger: { bg: 'dangerSoft', fg: 'danger', border: null },
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const c = COLORS[variant];
  const isDisabled = disabled || loading;
  const fg = theme[c.fg];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        {
          backgroundColor:
            variant === 'primary' && pressed ? theme.brandPressed : c.bg ? theme[c.bg] : 'transparent',
          borderColor: c.border ? theme[c.border] : 'transparent',
          opacity: isDisabled ? 0.5 : pressed && variant !== 'primary' ? 0.75 : 1,
        },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 18} color={fg} /> : null}
          <Text variant={size === 'sm' ? 'smallStrong' : 'bodyStrong'} style={{ color: fg }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  md: { minHeight: 50, paddingHorizontal: Spacing.five },
  sm: { minHeight: 36, paddingHorizontal: Spacing.four },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
