import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { JobRow, SalonChips, Separator } from '@/components/salon';
import { SegmentedControl } from '@/components/segmented-control';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { api, type SalonJob } from '@/lib/api';
import { siteUrl } from '@/lib/config';
import { useMode } from '@/lib/mode';

type Show = 'live' | 'drafts' | 'ended';

const SHOWS: { value: Show; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'ended', label: 'Ended' },
];

const MATCHES: Record<Show, (job: SalonJob) => boolean> = {
  live: (job) => job.status === 'published',
  drafts: (job) => job.status === 'draft',
  ended: (job) => job.status === 'closed' || job.status === 'expired',
};

/** Every job at every salon you're on (D-20). Jobs are posted and edited on the website. */
export default function HiringScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { salons } = useMode();
  const [salonId, setSalonId] = useState<string>();
  const [show, setShow] = useState<Show>('live');
  const { data, error, loading, refreshing, reload, refresh } = useRequest(() => api.salon.jobs(), {
    refetchOnFocus: true,
  });

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;

  const jobs = (data?.items ?? []).filter(
    (job) => MATCHES[show](job) && (!salonId || job.salon.id === salonId),
  );
  const postOnWebsite = () => WebBrowser.openBrowserAsync(siteUrl('/employer/jobs/new'));

  return (
    <FlatList
      data={jobs}
      keyExtractor={(job) => job.id}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.brand} colors={[theme.brand]} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <SalonChips salons={salons} value={salonId} onChange={setSalonId} />
          <SegmentedControl segments={SHOWS} value={show} onChange={setShow} />
        </View>
      }
      ItemSeparatorComponent={Separator}
      renderItem={({ item }) => (
        <JobRow
          job={item}
          showSalon={salons.length > 1 && !salonId}
          onPress={() =>
            router.push({
              pathname: '/hire/job/[salonId]/[id]',
              params: { salonId: item.salon.id, id: item.id },
            })
          }
        />
      )}
      ListEmptyComponent={
        <EmptyView
          icon="jobs"
          title={show === 'live' ? 'No live jobs' : show === 'drafts' ? 'No drafts' : 'Nothing ended'}
          body="Post and edit jobs on the website. They show up here to follow."
          actionLabel="Post a job on the website"
          onAction={postOnWebsite}
        />
      }
      ListFooterComponent={
        jobs.length ? (
          <Button
            title="Post a job on the website"
            variant="ghost"
            icon="web"
            onPress={postOnWebsite}
            style={styles.footer}
          />
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.four, paddingBottom: Spacing.seven, flexGrow: 1 },
  header: { paddingBottom: Spacing.two },
  footer: { marginTop: Spacing.four },
});
