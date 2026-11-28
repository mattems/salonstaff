import {
  AU_STATES,
  EMPLOYMENT_TYPES,
  JOB_ROLES,
  labelFor,
  type AuState,
  type EmploymentType,
  type JobRole,
} from '@salonstaff/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { JobCard } from '@/components/job-card';
import { ProfileNudge } from '@/components/profile-strength';
import { SearchField } from '@/components/search-field';
import { SelectSheet } from '@/components/select-sheet';
import { EmptyView, ErrorBanner, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage, type JobSummary } from '@/lib/api';

type Filters = { q?: string; role?: JobRole; state?: AuState; type?: EmploymentType };
type LoadMode = 'initial' | 'refresh' | 'more';
type Feed = { key: string; items: JobSummary[]; page: number; total: number };
type Sheet = 'role' | 'state' | 'type' | null;

const STATE_OPTIONS = AU_STATES.map((s) => ({ value: s.value, label: `${s.value} · ${s.label}` }));

export default function JobsScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 350);
  const [role, setRole] = useState<JobRole | undefined>();
  const [state, setState] = useState<AuState | undefined>();
  const [type, setType] = useState<EmploymentType | undefined>();
  const [sheet, setSheet] = useState<Sheet>(null);

  // Results are tagged with the filter key they were fetched for, so "loading" is derived
  // (key mismatch) rather than set synchronously inside an effect.
  const [feed, setFeed] = useState<Feed | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [pending, setPending] = useState<'refresh' | 'more' | null>(null);
  const requestId = useRef(0);

  const filters: Filters = { q: q || undefined, role, state, type };
  const filterKey = JSON.stringify(filters);

  const fetchPage = useCallback((key: string, pageNum: number) => {
    const id = ++requestId.current;
    return api.jobs({ ...(JSON.parse(key) as Filters), page: pageNum }).then(
      (res) => {
        if (id !== requestId.current) return;
        setFeed((prev) => {
          if (pageNum === 1 || !prev || prev.key !== key) {
            return { key, items: res.items, page: res.page, total: res.total };
          }
          const seen = new Set(prev.items.map((j) => j.id));
          return {
            key,
            items: [...prev.items, ...res.items.filter((j) => !seen.has(j.id))],
            page: res.page,
            total: res.total,
          };
        });
        setFailure(null);
        setPending(null);
      },
      (err: unknown) => {
        if (id !== requestId.current) return;
        setFailure({ key, message: errorMessage(err) });
        setPending(null);
      },
    );
  }, []);

  useEffect(() => {
    void fetchPage(filterKey, 1);
  }, [filterKey, fetchPage]);

  const items = feed?.items ?? [];
  const total = feed?.total ?? 0;
  const page = feed?.page ?? 1;
  const isCurrent = feed?.key === filterKey;
  const error = failure?.key === filterKey ? failure.message : null;
  const loading: LoadMode | null = pending ?? (!isCurrent && !error ? 'initial' : null);
  const hasMore = isCurrent && items.length < total;
  const activeCount = [role, state, type].filter(Boolean).length;

  function reloadFirstPage(mode: 'refresh' | null) {
    setFailure(null);
    setPending(mode);
    void fetchPage(filterKey, 1);
  }

  function loadMore() {
    if (!hasMore || loading || error) return;
    setPending('more');
    void fetchPage(filterKey, page + 1);
  }

  function retryMore() {
    setFailure(null);
    setPending('more');
    void fetchPage(filterKey, page + 1);
  }

  function clearFilters() {
    setRole(undefined);
    setState(undefined);
    setType(undefined);
  }

  const showFullError = error && items.length === 0;

  return (
    <View style={styles.flex}>
      <View style={[styles.top, { borderBottomColor: theme.border }]}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search jobs, salons, suburbs" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled">
          <Chip
            label={role ? labelFor(JOB_ROLES, role) : 'Role'}
            selected={!!role}
            trailingIcon="chevronDown"
            onPress={() => setSheet('role')}
          />
          <Chip
            label={state ?? 'State'}
            selected={!!state}
            trailingIcon="chevronDown"
            onPress={() => setSheet('state')}
          />
          <Chip
            label={type ? labelFor(EMPLOYMENT_TYPES, type) : 'Job type'}
            selected={!!type}
            trailingIcon="chevronDown"
            onPress={() => setSheet('type')}
          />
          {activeCount > 0 ? <Chip label="Clear" icon="close" onPress={clearFilters} /> : null}
        </ScrollView>
      </View>

      {loading === 'initial' && items.length === 0 ? (
        <LoadingView />
      ) : showFullError ? (
        <ErrorView message={error} onRetry={() => reloadFirstPage(null)} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(job) => job.id}
          renderItem={({ item }) => <JobCard job={item} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={Separator}
          keyboardDismissMode="on-drag"
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={loading === 'refresh'}
              onRefresh={() => reloadFirstPage('refresh')}
              tintColor={theme.brand}
              colors={[theme.brand]}
            />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              {/* Finishing their profile comes first (D-24). */}
              <ProfileNudge where="jobs" />
              {items.length > 0 ? (
                <Text variant="small" color="textMuted" style={styles.count}>
                  {total.toLocaleString('en-AU')} {total === 1 ? 'job' : 'jobs'}
                  {loading === 'initial' ? ' · updating…' : ''}
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyView
              icon="search"
              title="No jobs found"
              body={
                q || activeCount
                  ? 'Try a different search or fewer filters.'
                  : 'New roles are posted every day — check back soon.'
              }
              actionLabel={activeCount ? 'Clear filters' : undefined}
              onAction={activeCount ? clearFilters : undefined}
            />
          }
          ListFooterComponent={
            loading === 'more' ? (
              <ActivityIndicator color={theme.brand} style={styles.footer} />
            ) : error ? (
              <View style={styles.footer}>
                <ErrorBanner message={error} />
                <Text
                  variant="smallStrong"
                  color="brand"
                  style={styles.retry}
                  onPress={retryMore}>
                  Try again
                </Text>
              </View>
            ) : undefined
          }
        />
      )}

      <SelectSheet
        visible={sheet === 'role'}
        title="Role"
        options={JOB_ROLES}
        value={role}
        anyLabel="Any role"
        onSelect={setRole}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === 'state'}
        title="State"
        options={STATE_OPTIONS}
        value={state}
        anyLabel="Anywhere in Australia"
        onSelect={setState}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === 'type'}
        title="Job type"
        options={EMPLOYMENT_TYPES}
        value={type}
        anyLabel="Any type"
        onSelect={setType}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

function Separator() {
  return <View style={{ height: Spacing.three }} />;
}

const styles = StyleSheet.create({
  header: { gap: Spacing.three },
  flex: { flex: 1 },
  top: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chips: { gap: Spacing.two },
  list: { padding: Spacing.four, paddingBottom: Spacing.seven, flexGrow: 1 },
  count: { marginBottom: Spacing.three },
  footer: { paddingVertical: Spacing.five, gap: Spacing.two },
  retry: { textAlign: 'center' },
});
