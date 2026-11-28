import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ApplicantRow, SalonChips, Separator } from '@/components/salon';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { type ApplicationStatus, api } from '@/lib/api';
import { useMode } from '@/lib/mode';

const STATUSES: { value: ApplicationStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'submitted', label: 'New' },
  { value: 'viewed', label: 'Viewed' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interview', label: 'Interview' },
  { value: 'hired', label: 'Hired' },
  { value: 'declined', label: 'Not progressing' },
];

/**
 * Everyone who applied for a job at any of your salons (D-17, D-20), by status. New ones shown
 * become viewed, as on the website.
 */
export default function ApplicantsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { salons } = useMode();
  const [salonId, setSalonId] = useState<string>();
  const [status, setStatus] = useState<ApplicationStatus>();
  const { data, error, loading, refreshing, reload, refresh } = useRequest(
    () => api.salon.applicants({ salonId, status, sort: 'newest' }),
    { key: `${salonId}/${status}`, refetchOnFocus: true },
  );

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;

  const count = (value: ApplicationStatus | undefined) =>
    value ? (data?.counts[value] ?? 0) : (data?.total ?? 0);

  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.brand} colors={[theme.brand]} />
      }
      ListHeaderComponent={
        <View>
          <SalonChips salons={salons} value={salonId} onChange={setSalonId} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {STATUSES.map((s) => (
              <Chip
                key={s.label}
                label={`${s.label} ${count(s.value)}`}
                selected={status === s.value}
                onPress={() => setStatus(s.value)}
              />
            ))}
          </ScrollView>
        </View>
      }
      ItemSeparatorComponent={Separator}
      renderItem={({ item }) => (
        <ApplicantRow
          applicant={item}
          showSalon={salons.length > 1 && !salonId}
          onPress={() =>
            router.push({
              pathname: '/hire/application/[salonId]/[id]',
              params: { salonId: item.salon.id, id: item.id },
            })
          }
        />
      )}
      ListEmptyComponent={
        <EmptyView
          icon="people"
          title={status ? 'Nobody here' : 'No applicants yet'}
          body={status ? undefined : 'When someone applies for one of your jobs, they show up here.'}
        />
      }
      ListFooterComponent={
        data?.truncated ? (
          <Text variant="caption" color="textMuted" style={styles.more}>
            Showing the first {data.items.length}. Choose a salon or status to see the rest.
          </Text>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.four, paddingBottom: Spacing.seven, flexGrow: 1 },
  chips: { gap: Spacing.two, paddingBottom: Spacing.two },
  more: { marginTop: Spacing.three, textAlign: 'center' },
});
