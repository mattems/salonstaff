import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { StrengthBar } from '@/components/profile-strength';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useMyProfile } from '@/hooks/use-my-profile';
import { useTheme } from '@/hooks/use-theme';
import { strengthOfMyProfile } from '@/lib/profile-strength';

/**
 * The end of setting up (D-24): they're in, and how complete their profile is. The push is to
 * finish it ("Finish my profile" opens Profile, with what to add next); jobs can wait.
 */
export default function SetupDoneScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useMyProfile();
  const strength = data ? strengthOfMyProfile(data) : null;

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + Spacing.seven,
          paddingBottom: Math.max(insets.bottom, Spacing.four),
        },
      ]}>
      <View style={styles.body}>
        <View style={[styles.badge, { backgroundColor: theme.successSoft }]}>
          <Icon name="done" size={36} color={theme.success} />
        </View>
        <Text variant="title" accessibilityRole="header">
          {data ? `You’re in, ${data.profile.firstName}` : 'You’re in'}
        </Text>
        {strength ? (
          <>
            <Text color="textSecondary">
              Your profile is {strength.score}% complete. Salons look at complete profiles first, so
              a few more minutes now gets you noticed.
            </Text>
            <View style={styles.meter}>
              <StrengthBar score={strength.score} />
              <Text variant="smallStrong" color="brand">
                {strength.score}%
              </Text>
            </View>
            <View style={styles.todo}>
              {strength.todo.slice(0, 3).map((t) => (
                <View key={t.part} style={styles.row}>
                  <Icon name={t.icon} size={18} color={theme.brand} />
                  <Text style={styles.flex}>{t.action}</Text>
                  <Text variant="smallStrong" color="textMuted">
                    +{t.points}%
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button title="Finish my profile" onPress={() => router.dismissTo('/profile')} />
        <Button title="Look at jobs" variant="ghost" onPress={() => router.dismissTo('/')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: Spacing.five },
  body: { flex: 1, gap: Spacing.four },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  meter: { gap: Spacing.two },
  todo: { gap: Spacing.three, marginTop: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  actions: { gap: Spacing.two },
});
