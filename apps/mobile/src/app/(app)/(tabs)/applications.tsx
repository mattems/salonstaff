import { APPLICATION_STATUSES, labelFor, type ApplicationStatus } from '@salonstaff/shared';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { JobCard } from '@/components/job-card';
import { Pill, type Tone } from '@/components/pill';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

const STATUS_TONES: Record<ApplicationStatus, Tone> = {
  submitted: 'neutral',
  viewed: 'info',
  shortlisted: 'brand',
  interview: 'warning',
  hired: 'success',
  declined: 'neutral',
};

export default function ApplicationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data, error, loading, refreshing, reload, refresh } = useRequest(api.myApplications, { refetchOnFocus: true });

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;

  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(app) => app.id}
      renderItem={({ item }) => (
        <JobCard
          job={item.job}
          footer={
            <View style={[styles.statusRow, { borderTopColor: theme.border }]}>
              <Pill
                label={labelFor(APPLICATION_STATUSES, item.status)}
                tone={STATUS_TONES[item.status] ?? 'neutral'}
              />
              <Text variant="caption" color="textMuted">
                Applied {formatDate(item.createdAt)}
              </Text>
            </View>
          }
        />
      )}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={Separator}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={theme.brand}
          colors={[theme.brand]}
        />
      }
      ListEmptyComponent={
        <EmptyView
          icon="applications"
          title="No applications yet"
          body="When you apply for a job, you can track its progress here."
          actionLabel="Find a job"
          onAction={() => router.navigate('/')}
        />
      }
    />
  );
}

function Separator() {
  return <View style={{ height: Spacing.three }} />;
}

const styles = StyleSheet.create({
  list: { padding: Spacing.four, paddingBottom: Spacing.seven, flexGrow: 1 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
