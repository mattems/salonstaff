import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { SetupScreen } from '@/components/setup-screen';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { askForPushLater, registerForPush } from '@/lib/push-notifications';
import { useSetup } from '@/lib/setup';

const POINTS: { icon: IconName; text: string }[] = [
  { icon: 'chat', text: 'A salon messages you about a job' },
  { icon: 'applications', text: 'An application moves along: shortlisted, interview, hired' },
  { icon: 'eye', text: 'A salon looks at your number' },
];

/**
 * Step 6: why notifications are worth it, before iOS asks (it only ever asks once). "Not now"
 * means the app doesn't ask by itself again; Settings can still turn them on.
 */
export default function SetupNotificationsScreen() {
  const theme = useTheme();
  const { next } = useSetup();
  const [asking, setAsking] = useState(false);

  async function turnOn() {
    setAsking(true);
    try {
      await registerForPush();
    } catch {
      // Not allowed, or the API can't send them yet: every notice also goes by email.
    } finally {
      setAsking(false);
      next('notifications');
    }
  }

  async function later() {
    await askForPushLater();
    next('notifications');
  }

  return (
    <SetupScreen
      step="notifications"
      title="Know when salons reply"
      subtitle="Salons often hire within days. We’ll let you know straight away when:"
      footer={
        <>
          <Button title="Turn on notifications" icon="bell" loading={asking} onPress={turnOn} />
          <Button title="Not now" variant="ghost" disabled={asking} onPress={later} />
        </>
      }>
      <View style={styles.points}>
        {POINTS.map((p) => (
          <View key={p.icon} style={styles.point}>
            <View style={[styles.badge, { backgroundColor: theme.brandSoft }]}>
              <Icon name={p.icon} size={18} color={theme.brand} />
            </View>
            <Text style={styles.flex}>{p.text}</Text>
          </View>
        ))}
      </View>
      <Text variant="small" color="textMuted">
        Choose what you hear about any time in Settings.
      </Text>
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  points: { gap: Spacing.four, marginVertical: Spacing.two },
  point: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
