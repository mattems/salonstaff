import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type RadioOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

/** One choice from a short list, each with a line of explanation. */
export function RadioList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <Card style={styles.card}>
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={option.disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: option.disabled }}
            style={[
              styles.row,
              { opacity: option.disabled ? 0.5 : 1 },
              i > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
            ]}>
            <View style={[styles.radio, { borderColor: selected ? theme.brand : theme.border }]}>
              {selected ? <View style={[styles.dot, { backgroundColor: theme.brand }]} /> : null}
            </View>
            <View style={styles.text}>
              <Text variant="bodyStrong">{option.label}</Text>
              {option.description ? (
                <Text variant="small" color="textSecondary">
                  {option.description}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 0, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three, paddingVertical: Spacing.three },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { flex: 1, gap: 2 },
});
