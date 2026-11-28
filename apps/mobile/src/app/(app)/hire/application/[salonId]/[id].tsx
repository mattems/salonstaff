import { APPLICATION_STATUSES, RIGHT_TO_WORK, labelFor } from '@salonstaff/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Pill } from '@/components/pill';
import { ProfilePhoto } from '@/components/profile-photo';
import { APPLICATION_TONES, applicationLabel } from '@/components/salon';
import { Screen } from '@/components/screen';
import { SelectSheet } from '@/components/select-sheet';
import { ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { type ApplicationStatus, api, errorMessage } from '@/lib/api';
import { formatAuMobile, formatDate } from '@/lib/format';
import { useMode } from '@/lib/mode';

const STATUS_OPTIONS = APPLICATION_STATUSES.map((s) => ({
  value: s.value,
  label: s.value === 'submitted' ? 'New' : s.label,
}));

/**
 * One application (D-17): who applied and for what, moving it along (they're told when it's
 * shortlisted, interview, hired or not progressing), and getting in touch: the conversation, or
 * their number when they share it. Opening a new one makes it viewed.
 */
export default function SalonApplicationScreen() {
  const { salonId, id } = useLocalSearchParams<{ salonId: string; id: string }>();
  const router = useRouter();
  const { refreshSalons } = useMode();
  const [choosing, setChoosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const { data, error, loading, refreshing, reload, refresh, setData } = useRequest(
    async () => {
      const application = await api.salon.application(salonId, id);
      const candidate = application.candidate
        ? await api.salon.candidate(salonId, application.candidateId).catch(() => null)
        : null;
      return { application, contact: candidate?.contact ?? null };
    },
    { key: `${salonId}/${id}`, refetchOnFocus: true },
  );

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;
  const { application, contact } = data;
  const person = application.candidate;
  const name = person ? `${person.firstName} ${person.lastName}` : 'Deleted account';
  const v = application.verification;

  async function changeStatus(next: ApplicationStatus | undefined) {
    setChoosing(false);
    if (!next || next === application.status) return;
    const before = application.status;
    setData((prev) => (prev ? { ...prev, application: { ...prev.application, status: next } } : prev));
    setSaving(true);
    try {
      await api.salon.setStatus(salonId, id, next);
    } catch (err) {
      setData((prev) =>
        prev ? { ...prev, application: { ...prev.application, status: before } } : prev,
      );
      Alert.alert('Couldn’t change the status', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function showNumber() {
    setLooking(true);
    try {
      const { phone } = await api.salon.showNumber(salonId, application.candidateId);
      Alert.alert(formatAuMobile(phone), `${person?.firstName ?? 'They'} can see that you looked.`, [
        { text: 'Close', style: 'cancel' },
        { text: 'Text', onPress: () => void Linking.openURL(`sms:${phone}`) },
        { text: 'Call', onPress: () => void Linking.openURL(`tel:${phone}`) },
      ]);
      void refreshSalons();
    } catch (err) {
      Alert.alert('Couldn’t show their number', errorMessage(err));
    } finally {
      setLooking(false);
    }
  }

  const openConversation = () =>
    router.push({
      pathname: '/hire/conversation/[salonId]/[userId]',
      params: { salonId, userId: application.candidateId },
    });

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: person?.firstName ?? 'Application' }} />
      <Card>
        <View style={styles.header}>
          <ProfilePhoto
            photoUrl={person?.photoUrl}
            firstName={person?.firstName}
            lastName={person?.lastName}
            size={56}
          />
          <View style={styles.flex}>
            <Text variant="heading">{name}</Text>
            {person?.headline ? (
              <Text variant="small" color="textSecondary">
                {person.headline}
              </Text>
            ) : null}
            {person ? (
              <Text variant="small" color="textSecondary">
                {person.suburb} {person.state} · {person.yearsExperience ?? 0} yrs ·{' '}
                {labelFor(RIGHT_TO_WORK, person.rightToWork)}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.pills}>
          {v.identity === 'verified' ? <Pill label="ID verified" tone="success" icon="verified" /> : null}
          {v.rightToWork === 'verified' ? <Pill label="Work rights checked" tone="success" /> : null}
          {v.qualification === 'verified' ? (
            <Pill label="Qualification verified" tone="success" />
          ) : null}
        </View>
        {person ? (
          <Button
            title="Full profile"
            size="sm"
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: '/hire/candidate/[salonId]/[userId]',
                params: { salonId, userId: application.candidateId },
              })
            }
            style={styles.start}
          />
        ) : null}
      </Card>

      <Card>
        <Text variant="overline" color="textMuted">
          Applied for
        </Text>
        <Text variant="bodyStrong">{application.job.title}</Text>
        <Text variant="small" color="textSecondary">
          {application.salon.name} · {formatDate(application.createdAt)}
        </Text>
        <View style={styles.statusRow}>
          <Pill label={applicationLabel(application.status)} tone={APPLICATION_TONES[application.status]} />
          <Button
            title="Change status"
            size="sm"
            variant="outline"
            loading={saving}
            onPress={() => setChoosing(true)}
          />
        </View>
        <Text variant="caption" color="textMuted">
          They’re told when it’s shortlisted, interview, hired or not progressing.
        </Text>
        {application.coverNote ? (
          <View style={styles.note}>
            <Text variant="overline" color="textMuted">
              Their note
            </Text>
            <Text selectable>{application.coverNote}</Text>
          </View>
        ) : null}
      </Card>

      {person ? (
        <View style={styles.actions}>
          <Button
            title={
              application.unreadMessages > 0
                ? `Messages (${application.unreadMessages} new)`
                : application.lastMessageAt
                  ? 'Messages'
                  : 'Message'
            }
            icon="chat"
            onPress={openConversation}
          />
          {contact?.phone ? (
            <Button
              title="Show number"
              icon="phone"
              variant="outline"
              loading={looking}
              onPress={showNumber}
            />
          ) : null}
        </View>
      ) : null}

      <SelectSheet
        visible={choosing}
        title="Status"
        options={STATUS_OPTIONS}
        value={application.status}
        onSelect={(value) => void changeStatus(value)}
        onClose={() => setChoosing(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  start: { alignSelf: 'flex-start' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  note: { gap: Spacing.one },
  actions: { gap: Spacing.two },
});
