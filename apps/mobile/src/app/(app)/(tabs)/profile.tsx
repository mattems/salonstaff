import { JOB_ROLES, RIGHT_TO_WORK, labelFor } from '@salonstaff/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { VerificationBadge } from '@/components/verification-badge';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useUser } from '@/lib/auth';
import { initials } from '@/lib/format';

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useUser();
  const { refresh, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const profile = user.profile;

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You can sign back in any time with your email.', [
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
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.brand }]}>
          <Text variant="title" style={{ color: theme.onBrand }}>
            {initials(profile?.firstName, profile?.lastName, user.email)}
          </Text>
        </View>
        <View style={styles.headerText}>
          <Text variant="title" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="small" color="textSecondary" numberOfLines={1}>
            {profile?.headline || user.email}
          </Text>
        </View>
      </View>

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
          {profile.phone ? <Row label="Mobile" value={profile.phone} /> : null}
          {profile.instagram ? <Row label="Instagram" value={`@${profile.instagram.replace(/^@/, '')}`} /> : null}
          {profile.qualifications ? <Row label="Qualifications" value={profile.qualifications} /> : null}
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

      <Card style={styles.menu}>
        <ListRow icon="edit" title="Edit profile" onPress={() => router.push('/edit-profile')} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <ListRow
          icon="shield"
          title="Verification centre"
          subtitle="Identity, right to work, qualifications"
          onPress={() => router.push('/verification')}
        />
      </Card>

      <Card style={styles.menu}>
        <ListRow icon="signOut" title="Sign out" subtitle={user.email} onPress={confirmSignOut} />
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
  avatar: {
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: Spacing.three },
  rowLabel: { width: 110 },
  rowValue: { flex: 1 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  menu: { paddingVertical: Spacing.one, gap: 0 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 34 },
});
