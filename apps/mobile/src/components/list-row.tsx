import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ListRowProps = {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  color?: ThemeColor;
  right?: React.ReactNode;
};

export function ListRow({ icon, title, subtitle, onPress, color = 'text', right }: ListRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={20} color={theme[color === 'text' ? 'textSecondary' : color]} />
      <View style={styles.text}>
        <Text variant="bodyStrong" color={color}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? <Icon name="chevronRight" size={14} color={theme.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three + 2,
    minHeight: 56,
    paddingVertical: Spacing.two,
  },
  text: { flex: 1, gap: 1 },
});
