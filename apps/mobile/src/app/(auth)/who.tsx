import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * After "Get started": who they are. Job seekers go on to sign up with their mobile; salons are told
 * hiring is set up on the website, and can sign in if they're already on a salon's team. Signing in
 * doesn't ask this: the account already knows which side it's on.
 */
export default function WhoScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]} edges={['bottom']}>
      <View style={styles.content}>
        <View style={styles.intro}>
          <Text variant="title" accessibilityRole="header">
            What brings you to Salon Staff?
          </Text>
          <Text color="textSecondary">Choose one to get set up. You can do both later.</Text>
        </View>

        <Choice
          icon="scissors"
          title="I’m looking for work"
          body="Hairdressers, barbers, beauty therapists, nail techs and apprentices."
          onPress={() => router.push({ pathname: '/sign-in', params: { intent: 'signup' } })}
        />
        <Choice
          icon="store"
          title="I’m hiring for a salon"
          body="Post jobs, find staff and message applicants."
          onPress={() => router.push('/for-salons')}
        />
      </View>
    </SafeAreaView>
  );
}

function Choice({
  icon,
  title,
  body,
  onPress,
}: {
  icon: IconName;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      style={({ pressed }) => [
        styles.choice,
        { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.75 : 1 },
      ]}>
      <View style={[styles.badge, { backgroundColor: theme.brandSoft }]}>
        <Icon name={icon} size={24} color={theme.brand} />
      </View>
      <View style={styles.flex}>
        <Text variant="subheading">{title}</Text>
        <Text variant="small" color="textSecondary">
          {body}
        </Text>
      </View>
      <Icon name="chevronRight" size={16} color={theme.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, padding: Spacing.five, paddingTop: 120, gap: Spacing.four },
  intro: { gap: Spacing.two, marginBottom: Spacing.three },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    padding: Spacing.five,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
