import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MAX_YEARS = 60;

/** Years of experience, set with − and + rather than typed. */
export function YearsStepper({ years, onChange }: { years: number; onChange: (years: number) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.flex}>
        <Text variant="bodyStrong">Years of experience</Text>
        <Text variant="small" color="textSecondary">
          {years === 0 ? 'Starting out, or under a year' : `${years} year${years === 1 ? '' : 's'}`}
        </Text>
      </View>
      <Step
        icon="minus"
        label="One year less"
        disabled={years <= 0}
        onPress={() => onChange(years - 1)}
      />
      <Text variant="heading" style={styles.count} accessibilityLabel={`${years} years`}>
        {years}
      </Text>
      <Step
        icon="add"
        label="One year more"
        disabled={years >= MAX_YEARS}
        onPress={() => onChange(years + 1)}
      />
    </View>
  );
}

function Step({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: theme.brandSoft, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
      ]}>
      <Icon name={icon} size={16} color={theme.brand} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  step: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
