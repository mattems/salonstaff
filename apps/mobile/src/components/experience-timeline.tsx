import type { Experience as ExperienceItem } from '@/lib/api';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPeriod } from '@/lib/format';

/** Most recent first, current roles on top. */
export function sortExperience(items: ExperienceItem[]): ExperienceItem[] {
  return [...items].sort((a, b) => {
    const ae = a.endMonth ?? '9999-99';
    const be = b.endMonth ?? '9999-99';
    return be.localeCompare(ae) || b.startMonth.localeCompare(a.startMonth);
  });
}

export function ExperienceTimeline({
  items,
  renderAction,
}: {
  items: ExperienceItem[];
  renderAction?: (item: ExperienceItem) => React.ReactNode;
}) {
  const theme = useTheme();
  const sorted = sortExperience(items);
  return (
    <View>
      {sorted.map((item, i) => {
        const last = i === sorted.length - 1;
        return (
          <View key={item.id} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  { borderColor: theme.brand, backgroundColor: item.endMonth ? theme.surface : theme.brand },
                ]}
              />
              {!last ? <View style={[styles.line, { backgroundColor: theme.border }]} /> : null}
            </View>
            <View style={[styles.body, !last && styles.bodySpacing]}>
              <View style={styles.titleRow}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{item.title}</Text>
                  <Text variant="small" color="textSecondary">
                    {item.salonName}
                    {item.location ? ` · ${item.location}` : ''}
                  </Text>
                </View>
                {renderAction?.(item)}
              </View>
              <Text variant="caption" color="textMuted">
                {formatPeriod(item.startMonth, item.endMonth)}
              </Text>
              {item.description ? (
                <Text variant="small" color="textSecondary" style={styles.description}>
                  {item.description}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.three },
  rail: { width: 14, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 6 },
  line: { flex: 1, width: 2, marginTop: 4 },
  body: { flex: 1, gap: 2 },
  bodySpacing: { paddingBottom: Spacing.five },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  description: { marginTop: Spacing.one },
});
