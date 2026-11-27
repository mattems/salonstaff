import { APPLICATION_STATUSES, labelFor } from '@salonstaff/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

/** One application. Messages with the salon are in the Inbox, one conversation per salon (D-19). */
export default function ApplicationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, refreshing, reload, refresh } = useRequest(
    () => api.application(id),
    { key: id, refetchOnFocus: true },
  );

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;

  const { job, conversationId, unreadMessages } = data;
  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: job.salon.name }} />
      <Card>
        <Pressable
          onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id, path: job.path } })}
          accessibilityRole="button"
          style={styles.job}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">{job.title}</Text>
            <Text variant="caption" color="textMuted">
              {job.salon.name} · Applied {formatDate(data.createdAt)}
            </Text>
          </View>
          <Pill label={labelFor(APPLICATION_STATUSES, data.status)} tone="brand" />
        </Pressable>
        {data.coverNote ? (
          <Text variant="small" color="textSecondary">
            {data.coverNote}
          </Text>
        ) : null}
      </Card>
      {conversationId ? (
        <Button
          title={unreadMessages ? `Messages · ${unreadMessages} new` : `Messages with ${job.salon.name}`}
          icon="chat"
          onPress={() => router.push({ pathname: '/inbox/[id]', params: { id: conversationId } })}
        />
      ) : (
        <Text variant="small" color="textSecondary" style={styles.centred}>
          No messages yet. When {job.salon.name} writes to you, it’s in your Inbox.
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  job: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  centred: { textAlign: 'center' },
});
