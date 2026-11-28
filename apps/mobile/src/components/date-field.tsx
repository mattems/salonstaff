import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';

/**
 * A date picked with the phone's own date picker (iOS's compact one: tap the date for a calendar).
 * The label sits on the left, the date on the right, like a row in Settings.
 */
export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  hint,
  error,
}: {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  hint?: string;
  error?: string | null;
}) {
  const theme = useTheme();
  const dark = useIsDark();
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.row,
          { backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.border },
        ]}>
        <Text style={styles.flex}>{label}</Text>
        <DateTimePicker
          value={value}
          mode="date"
          display="compact"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onValueChange={(_, date) => onChange(date)}
          accentColor={theme.brand}
          themeVariant={dark ? 'dark' : 'light'}
        />
      </View>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** "2026-11-28" → a date at local midnight, or null. */
export function dateFromIso(iso: string | null | undefined): Date | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** A date as "2026-11-28", in the phone's own time zone (not UTC). */
export function isoFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2022-03" → 1 March 2022, or null. */
export function dateFromMonth(month: string | null | undefined): Date | null {
  const m = month?.match(/^(\d{4})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : null;
}

/** A date as its month, "2022-03". */
export function monthFromDate(date: Date): string {
  return isoFromDate(date).slice(0, 7);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: Spacing.one + 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
    paddingLeft: Spacing.four,
    paddingRight: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
});
