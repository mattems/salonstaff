import { JOB_ROLES, RIGHT_TO_WORK, labelFor } from '@salonstaff/shared';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import type { IconName } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { Pill } from '@/components/pill';
import { ProfilePhoto } from '@/components/profile-photo';
import { ProfileStrengthCard, StaleProfileCard } from '@/components/profile-strength';
import { Text } from '@/components/text';
import { VerificationBadge } from '@/components/verification-badge';
import { Spacing } from '@/constants/theme';
import { useMyProfile } from '@/hooks/use-my-profile';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useUser } from '@/lib/auth';
import { formatAuMobile } from '@/lib/format';
import { useMode } from '@/lib/mode';

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useUser();
  const { refresh, signOut } = useAuth();
  const { canUseSalon, setMode } = useMode();
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const profile = user.profile;
  // The whole profile (portfolio, experience…), for how complete and current it is (D-24).
  const full = useMyProfile();
  const fullProfile = profile ? full.data : null;
  const signedInAs = user.email ?? (user.phoneNumber ? formatAuMobile(user.phoneNumber) : '');

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refresh(), profile ? full.reload() : null]);
    setRefreshing(false);
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your profile, verification records, applications and saved jobs. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.deleteAccount();
              await signOut({ revoke: false });
            } catch (err) {
              setDeleting(false);
              Alert.alert('Couldn’t delete account', errorMessage(err));
            }
          },
        },
      ],
    );
  }

  const name = profile ? `${profile.firstName} ${profile.lastName}` : 'Your profile';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.brand}
          colors={[theme.brand]}
        />
      }>
      {/* On a salon's team: back to the salon side (D-20). */}
      {canUseSalon ? (
        <Card style={styles.menu}>
          <ListRow
            icon="swap"
            title="Your salons"
            subtitle="Jobs, applicants and messages"
            onPress={async () => {
              await setMode('salon');
              router.replace('/hiring');
            }}
          />
        </Card>
      ) : null}

      <View style={styles.header}>
        <Pressable
          onPress={() => router.push(profile ? '/profile/photo' : '/edit-profile')}
          accessibilityRole="button"
          accessibilityLabel="Your photo">
          <ProfilePhoto
            photoUrl={profile?.photoUrl}
            firstName={profile?.firstName}
            lastName={profile?.lastName}
            fallback={signedInAs}
            size={64}
          />
        </Pressable>
        <View style={styles.headerText}>
          <Text variant="title" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="small" color="textSecondary" numberOfLines={1}>
            {profile?.headline || signedInAs}
          </Text>
        </View>
      </View>

      {fullProfile ? (
        <>
          <StaleProfileCard full={fullProfile} onConfirmed={(fresh) => full.setData(() => fresh)} />
          <ProfileStrengthCard full={fullProfile} />
        </>
      ) : null}

      <VerificationBadge level={user.verification.level} />
      {user.verification.level < 2 ? (
        <Button
          title={user.verification.level === 0 ? 'Verify your identity' : 'Finish verification'}
          icon="shield"
          onPress={() => router.push('/verification')}
        />
      ) : null}

      {profile ? (
        <Card>
          <View style={styles.cardHeader}>
            <Text variant="subheading">Profile</Text>
            {profile.openToWork ? <Pill label="Open to work" tone="success" /> : <Pill label="Not looking" />}
          </View>
          <Row label="Location" value={`${profile.suburb}, ${profile.state} ${profile.postcode}`} />
          <Row
            label="Experience"
            value={`${profile.yearsExperience} ${profile.yearsExperience === 1 ? 'year' : 'years'}`}
          />
          <Row label="Right to work" value={labelFor(RIGHT_TO_WORK, profile.rightToWork)} />
          {user.phoneNumber ? <Row label="Mobile" value={formatAuMobile(user.phoneNumber)} /> : null}
          {profile.instagram ? <Row label="Instagram" value={`@${profile.instagram.replace(/^@/, '')}`} /> : null}
          {profile.tiktok ? <Row label="TikTok" value={`@${profile.tiktok.replace(/^@/, '')}`} /> : null}
          <View style={styles.roles}>
            {profile.roles.map((r) => (
              <Pill key={r} label={labelFor(JOB_ROLES, r)} tone="brand" />
            ))}
          </View>
          {profile.about ? (
            <Text variant="small" color="textSecondary">
              {profile.about}
            </Text>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Text variant="subheading">Complete your profile</Text>
          <Text variant="small" color="textSecondary">
            Salons need your name, location and the roles you’re after before you can apply.
          </Text>
          <Button title="Set up profile" variant="secondary" onPress={() => router.push('/edit-profile')} />
        </Card>
      )}

      {MENU.map((group) => (
        <View key={group.label} style={styles.group}>
          <Text variant="overline" color="textMuted">
            {group.label}
          </Text>
          <Card style={styles.menu}>
            {group.items.map((item, i) => (
              <View key={item.title}>
                {i > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
                <ListRow
                  icon={item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                  onPress={() => router.push(item.needsProfile && !profile ? '/edit-profile' : item.href)}
                />
              </View>
            ))}
          </Card>
        </View>
      ))}


      <Card style={styles.menu}>
        <ListRow icon="signOut" title="Sign out" subtitle={signedInAs} onPress={confirmSignOut} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <ListRow
          icon="trash"
          title={deleting ? 'Deleting…' : 'Delete account'}
          color="danger"
          onPress={deleting ? () => {} : confirmDelete}
        />
      </Card>
    </ScrollView>
  );
}

type MenuItem = {
  href: Href;
  title: string;
  subtitle?: string;
  icon: IconName;
  /** Opens profile setup instead until there's a profile. */
  needsProfile?: true;
};

/** The same sections as the website's account pages. */
const MENU: { label: string; items: MenuItem[] }[] = [
  {
    label: 'Your profile',
    items: [
      { href: '/edit-profile', title: 'Basics', subtitle: 'Name, place, roles, work rights', icon: 'edit' },
      { href: '/profile/photo', title: 'Photo', icon: 'camera', needsProfile: true },
      { href: '/profile/skills', title: 'Skills', subtitle: 'Specialties and brands', icon: 'sparkles', needsProfile: true },
      { href: '/profile/availability', title: 'Availability and pay', icon: 'calendar', needsProfile: true },
      { href: '/profile/portfolio', title: 'Portfolio', subtitle: 'Photos of your work', icon: 'photos', needsProfile: true },
      { href: '/profile/experience', title: 'Experience and qualifications', icon: 'jobs', needsProfile: true },
      { href: '/profile/endorsements', title: 'Endorsements', icon: 'quote', needsProfile: true },
    ],
  },
  {
    label: 'Who sees it',
    items: [
      { href: '/profile/sharing', title: 'Visibility and sharing', subtitle: 'Your share link, salons you hide from', icon: 'eye', needsProfile: true },
      { href: '/profile/contact', title: 'How salons contact you', icon: 'chat', needsProfile: true },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/verification', title: 'Verification', subtitle: 'Identity, right to work, qualifications', icon: 'shield' },
      { href: '/profile/security', title: 'Sign-in and security', subtitle: 'Email, mobile, Google, Apple, devices', icon: 'lock' },
      { href: '/settings', title: 'Settings', subtitle: 'Notifications, Face ID, appearance, about the app', icon: 'settings' },
    ],
  },
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="small" color="textMuted" style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="small" style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.seven },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  headerText: { flex: 1, gap: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: Spacing.three },
  rowLabel: { width: 110 },
  rowValue: { flex: 1 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  menu: { paddingVertical: Spacing.one, gap: 0 },
  group: { gap: Spacing.two },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 34 },
});
