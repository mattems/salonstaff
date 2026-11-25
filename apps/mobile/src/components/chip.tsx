import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  trailingIcon?: IconName;
  disabled?: boolean;
};

export function Chip({ label, selected, onPress, icon, trailingIcon, disabled }: ChipProps) {
  const theme = useTheme();
  const fg = selected ? theme.onBrand : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.brand : theme.surface,
          borderColor: selected ? theme.brand : theme.border,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
      ]}>
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text variant="smallStrong" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
      {trailingIcon ? <Icon name={trailingIcon} size={12} color={fg} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    minHeight: 36,
    paddingHorizontal: Spacing.three + 2,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
});
