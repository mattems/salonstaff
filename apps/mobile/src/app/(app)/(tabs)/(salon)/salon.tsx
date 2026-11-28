import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth, useUser } from '@/lib/auth';
import { siteUrl } from '@/lib/config';
import { formatAuMobile } from '@/lib/format';
import { useMode } from '@/lib/mode';

/**
 * You and your salons, on the salon side (D-20). Salons' details, teams, billing and new jobs are
 * on the website; this links there.
 */
export default function SalonAccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useUser();
  const { refresh, signOut } = useAuth();
  const { salons, refreshSalons, setMode } = useMode();
  const [refreshing, setRefreshing] = useState(false);
  const signedInAs = user.email ?? (user.phoneNumber ? formatAuMobile(user.phoneNumber) : '');

  useFocusEffect(
    useCallback(() => {
      void refreshSalons();
    }, [refreshSalons]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refresh(), refreshSalons()]);
    setRefreshing(false);
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  async function toSeeker() {
    await setMode('seeker');
    router.replace('/');
  }

  const web = (path: string) => () => WebBrowser.openBrowserAsync(siteUrl(path));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} colors={[theme.brand]} />
      }>
      <View style={styles.headerText}>
        <Text variant="title">{user.name || 'Your account'}</Text>
        {signedInAs ? (
          <Text variant="small" color="textSecondary">
            {signedInAs}
          </Text>
        ) : null}
      </View>

      <View style={styles.group}>
        <Text variant="overline" color="textMuted">
          {salons.length === 1 ? 'Your salon' : 'Your salons'}
        </Text>
        <Card style={styles.menu}>
          {salons.map((salon, i) => (
            <View key={salon.id}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
              <ListRow
                icon="store"
                title={salon.name}
                subtitle={`${salon.suburb} ${salon.state} · ${salon.role === 'owner' ? 'Owner' : 'Manager'}`}
                onPress={web(`/employer/${salon.id}`)}
                right={
                  salon.status === 'active' ? undefined : <Pill label={salon.status} tone="danger" />
                }
              />
            </View>
          ))}
        </Card>
        <Text variant="caption" color="textMuted">
          Post and edit jobs, and change a salon’s details, team and billing, on the website.
        </Text>
      </View>

      <Card style={styles.menu}>
        <ListRow icon="add" title="Post a job" subtitle="On the website" onPress={web('/employer/jobs/new')} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <ListRow icon="web" title="Your salon area on the website" onPress={web('/employer')} />
      </Card>

      <Card style={styles.menu}>
        <ListRow
          icon="lock"
          title="Sign-in and security"
          subtitle="Email, mobile, Google, Apple, devices"
          onPress={() => router.push('/profile/security')}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <ListRow
          icon="settings"
          title="Settings"
          subtitle="Notifications, Face ID, appearance, about the app"
          onPress={() => router.push('/settings')}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <ListRow
          icon="swap"
          title="Look for work instead"
          subtitle="The job seeker’s side of the app"
          onPress={toSeeker}
        />
      </Card>

      <Card style={styles.menu}>
        <ListRow icon="signOut" title="Sign out" subtitle={signedInAs} onPress={confirmSignOut} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Room below the last row to scroll it clear of the floating tab bar.
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: 120 },
  headerText: { gap: 2 },
  menu: { paddingVertical: Spacing.one, gap: 0 },
  group: { gap: Spacing.two },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 34 },
});
