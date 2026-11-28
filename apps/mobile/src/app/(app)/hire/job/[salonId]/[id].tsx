import { EMPLOYMENT_TYPES, JOB_ROLES, labelFor } from '@salonstaff/shared';
import * as WebBrowser from 'expo-web-browser';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Pill } from '@/components/pill';
import { ApplicantRow, JOB_STATUS, Separator } from '@/components/salon';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { api, errorMessage } from '@/lib/api';
import { siteUrl } from '@/lib/config';
import { formatDate } from '@/lib/format';

/**
 * One of your jobs (D-20): where it's up to, closing or relisting it, and who applied. Editing it
 * is on the website.
 */
export default function SalonJobScreen() {
  const { salonId, id } = useLocalSearchParams<{ salonId: string; id: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { data, error, loading, refreshing, reload, refresh } = useRequest(
    async () => {
      const [job, applicants] = await Promise.all([
        api.salon.job(salonId, id),
        api.salon.applicants({ salonId, jobId: id, sort: 'newest' }),
      ]);
      return { job, applicants };
    },
    { key: `${salonId}/${id}`, refetchOnFocus: true },
  );

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;
  const { job, applicants } = data;
  const status = JOB_STATUS[job.status];
  const live = job.status === 'published';

  async function act(kind: 'publish' | 'close') {
    setBusy(true);
    try {
      await (kind === 'publish' ? api.salon.publish(salonId, id) : api.salon.close(salonId, id));
      await reload();
    } catch (err) {
      Alert.alert(kind === 'publish' ? 'Couldn’t publish it' : 'Couldn’t close it', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function confirmClose() {
    Alert.alert('Close this job?', 'It stops taking applications. You can relist it later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close job', style: 'destructive', onPress: () => void act('close') },
    ]);
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: job.title }} />
      <Card>
        <View style={styles.titleRow}>
          <Text variant="heading" style={styles.flex}>
            {job.title}
          </Text>
          <Pill label={status.label} tone={status.tone} />
        </View>
        <Text color="textSecondary">
          {job.salon.name} · {job.suburb} {job.state}
        </Text>
        <Text variant="small" color="textSecondary">
          {labelFor(JOB_ROLES, job.role)} · {labelFor(EMPLOYMENT_TYPES, job.employmentType)}
          {job.pay ? ` · ${job.pay}` : ''}
        </Text>
        {live && job.expiresAt ? (
          <Text variant="small" color="textMuted">
            Live until {formatDate(job.expiresAt)}
          </Text>
        ) : null}
        <View style={styles.actions}>
          {live ? (
            <Button title="Close job" size="sm" variant="outline" loading={busy} onPress={confirmClose} />
          ) : (
            <Button
              title={job.status === 'draft' ? 'Publish' : 'Relist'}
              size="sm"
              loading={busy}
              onPress={() => void act('publish')}
            />
          )}
          <Button
            title="Edit on the website"
            size="sm"
            variant="ghost"
            icon="web"
            onPress={() => WebBrowser.openBrowserAsync(siteUrl(`/employer/${salonId}/jobs/${id}/edit`))}
          />
        </View>
      </Card>

      <View style={styles.section}>
        <SectionHeader title={`Applicants (${applicants.total})`} />
        {applicants.items.length === 0 ? (
          <Text variant="small" color="textSecondary">
            {live
              ? 'Nobody yet. You’ll hear as soon as someone applies.'
              : 'Publish the job to start getting applicants.'}
          </Text>
        ) : (
          applicants.items.map((applicant, i) => (
            <View key={applicant.id}>
              {i > 0 ? <Separator /> : null}
              <ApplicantRow
                applicant={applicant}
                showSalon={false}
                onPress={() =>
                  router.push({
                    pathname: '/hire/application/[salonId]/[id]',
                    params: { salonId, id: applicant.id },
                  })
                }
              />
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  section: { gap: Spacing.two },
});
