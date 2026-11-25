import { WEEKDAYS } from '@salonstaff/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { useTheme } from '@/hooks/use-theme';

/** Mon–Sun circles. Read-only unless `onToggle` is passed. */
export function WeekStrip({
  days,
  onToggle,
}: {
  days: readonly string[];
  onToggle?: (day: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {WEEKDAYS.map((d) => {
        const on = days.includes(d.value);
        const circle = (
          <View
            style={[
              styles.day,
              {
                backgroundColor: on ? theme.brand : theme.surfaceMuted,
                borderColor: on ? theme.brand : theme.border,
              },
            ]}>
            <Text variant="caption" style={{ color: on ? theme.onBrand : theme.textMuted, fontWeight: '700' }}>
              {d.label.slice(0, onToggle ? 3 : 1)}
            </Text>
          </View>
        );
        return onToggle ? (
          <Pressable
            key={d.value}
            onPress={() => onToggle(d.value)}
            accessibilityRole="checkbox"
            accessibilityLabel={d.label}
            accessibilityState={{ checked: on }}
            style={styles.cell}>
            {circle}
          </Pressable>
        ) : (
          <View
            key={d.value}
            style={styles.cell}
            accessible
            accessibilityLabel={`${d.label}: ${on ? 'available' : 'unavailable'}`}>
            {circle}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { flex: 1, alignItems: 'center' },
  day: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
