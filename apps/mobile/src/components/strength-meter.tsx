import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { StrengthItem } from '@/lib/profile-strength';

export function StrengthMeter({ items, percent }: { items: StrengthItem[]; percent: number }) {
  const theme = useTheme();
  const router = useRouter();
  const missing = items.filter((i) => !i.done);
  const label = percent >= 100 ? 'All-star' : percent >= 70 ? 'Strong' : percent >= 40 ? 'Getting there' : 'Just started';

  return (
    <Card>
      <View style={styles.header}>
        <Text variant="subheading">Profile strength</Text>
        <Text variant="smallStrong" color="brand">
          {label} · {percent}%
        </Text>
      </View>
      <View
        style={[styles.track, { backgroundColor: theme.surfaceMuted }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.brand }]} />
      </View>
      {missing.length === 0 ? (
        <Text variant="small" color="textSecondary">
          Your profile is complete — salons see everything they need.
        </Text>
      ) : (
        <View>
          {missing.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.href)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
              <View style={[styles.iconWrap, { backgroundColor: theme.brandSoft }]}>
                <Icon name={item.icon} size={15} color={theme.brand} />
              </View>
              <Text variant="small" style={styles.flex}>
                {item.label}
              </Text>
              <Icon name="chevronRight" size={13} color={theme.textMuted} />
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 8, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 44 },
  iconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
