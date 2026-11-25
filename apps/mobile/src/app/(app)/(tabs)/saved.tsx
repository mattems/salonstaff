import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { JobCard } from '@/components/job-card';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';

export default function SavedScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data, error, loading, refreshing, reload, refresh } = useRequest(api.mySaved, { refetchOnFocus: true });

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;

  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(job) => job.id}
      renderItem={({ item }) => <JobCard job={item} />}
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
          icon="saved"
          title="No saved jobs yet"
          body="Tap Save on any job to keep it here for later."
          actionLabel="Browse jobs"
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
});
