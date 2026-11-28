import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { siteUrl } from '@/lib/config';

const POINTS: { icon: IconName; text: string }[] = [
  { icon: 'web', text: 'Set up your salon, team and billing, and post jobs, on salonstaff.com.au.' },
  { icon: 'people', text: 'Then use the app to see applicants, message them and move them along.' },
];

/**
 * "I'm hiring for a salon" (D-24): for now salons are set up on the website (D-20); the app's salon
 * side is for people already on a salon's team, who sign in. A salon sign-up in the app comes later.
 */
export default function ForSalonsScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]} edges={['bottom']}>
      <View style={styles.content}>
        <View style={[styles.badge, { backgroundColor: theme.brandSoft }]}>
          <Icon name="store" size={30} color={theme.brand} />
        </View>
        <Text variant="title" accessibilityRole="header">
          Hiring for your salon
        </Text>
        <View style={styles.points}>
          {POINTS.map((p) => (
            <View key={p.icon} style={styles.point}>
              <Icon name={p.icon} size={20} color={theme.brand} />
              <Text color="textSecondary" style={styles.flex}>
                {p.text}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          title="Set up on salonstaff.com.au"
          icon="web"
          onPress={() => void WebBrowser.openBrowserAsync(siteUrl('/employer'))}
        />
        <Button
          title="I’m on a salon’s team: sign in"
          variant="ghost"
          onPress={() => router.push('/sign-in')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, padding: Spacing.five, paddingTop: 120, gap: Spacing.four },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  points: { gap: Spacing.four, marginTop: Spacing.two },
  point: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  actions: { padding: Spacing.five, gap: Spacing.two },
});
