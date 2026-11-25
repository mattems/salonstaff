import {
  EMPLOYMENT_TYPES,
  JOB_ROLES,
  formatPay,
  labelFor,
  type JobDetail,
  type Me,
} from '@salonstaff/shared';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { SalonLogo } from '@/components/job-card';
import { Pill } from '@/components/pill';
import { ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { VerifiedTick } from '@/components/verified-tick';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { formatDate, timeAgo } from '@/lib/format';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Refetch on focus so `viewer` is fresh after applying or verifying.
  const { data: job, error, loading, reload, setData } = useRequest(() => api.job(id), {
    refetchOnFocus: true,
  });

  if (loading && !job) return <LoadingView />;
  if (error && !job) return <ErrorView message={error} onRetry={reload} />;
  if (!job) return null;

  return (
    <JobDetailView
      job={job}
      onSavedChange={(saved) =>
        setData((prev) => (prev ? { ...prev, viewer: { ...defaultViewer(prev), saved } } : prev))
      }
    />
  );
}

function defaultViewer(job: JobDetail): NonNullable<JobDetail['viewer']> {
  return job.viewer ?? { applied: false, saved: false, canApply: true };
}

type Cta = { label: string; href: Href; icon: IconName };

/** Work out what the seeker needs to do before they can apply. */
function blockerCta(user: Me, job: JobDetail, viewer: NonNullable<JobDetail['viewer']>): Cta | null {
  const r = (viewer.reason ?? '').toLowerCase();
  const profile: Cta = { label: 'Complete profile', href: '/edit-profile', icon: 'edit' };
  const verify: Cta = { label: 'Verify identity', href: '/verification', icon: 'shield' };
  const qualification: Cta = { label: 'Add qualification', href: '/verification', icon: 'qualification' };

  switch (viewer.reasonCode) {
    case 'profile':
      return profile;
    case 'verify':
      return verify;
    case 'qualification':
      return qualification;
    case 'applied':
    case 'employer':
    case 'login':
      return null;
  }
  // Fallback for older servers without reasonCode.
  if (r.includes('profile')) return profile;
  if (r.includes('identity') || r.includes('verify')) return verify;
  if (r.includes('qualif')) return qualification;
  if (r.includes('right to work')) return { ...verify, label: 'Add right to work' };
  if (!user.profile) return profile;
  if (user.verification.identity !== 'verified') return verify;
  if (job.requireQualification && user.verification.qualification !== 'verified') return qualification;
  return null;
}

function JobDetailView({ job, onSavedChange }: { job: JobDetail; onSavedChange: (saved: boolean) => void }) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useUser();
  const viewer = defaultViewer(job);
  const [saving, setSaving] = useState(false);
  const pay = formatPay(job.payMin, job.payMax, job.payPeriod);
  const cta = !viewer.applied && !viewer.canApply ? blockerCta(user, job, viewer) : null;

  async function toggleSave() {
    const next = !viewer.saved;
    onSavedChange(next);
    setSaving(true);
    try {
      const res = next ? await api.saveJob(job.id) : await api.unsaveJob(job.id);
      onSavedChange(res.saved);
    } catch (err) {
      onSavedChange(!next);
      Alert.alert('Couldn’t update saved jobs', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: job.salon.name }} />
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.salon}>
          <SalonLogo name={job.salon.name} uri={job.salon.logoUrl} size={52} />
          <View style={styles.flex}>
            <View style={styles.salonName}>
              <Text variant="bodyStrong" style={styles.shrink} numberOfLines={1}>
                {job.salon.name}
              </Text>
              {job.salon.verified ? <VerifiedTick size={16} /> : null}
            </View>
            <Text variant="small" color="textSecondary">
              {job.salon.suburb}, {job.salon.state}
            </Text>
          </View>
        </View>

        <Text variant="title">{job.title}</Text>

        <View style={styles.pills}>
          {job.featured ? <Pill label="Featured" tone="brand" icon="star" /> : null}
          <Pill label={labelFor(EMPLOYMENT_TYPES, job.employmentType)} />
          <Pill label={labelFor(JOB_ROLES, job.role)} />
        </View>

        <Card style={styles.facts}>
          {pay ? <Fact icon="pay" label="Pay" value={pay} /> : null}
          <Fact icon="location" label="Location" value={`${job.suburb}, ${job.state}`} />
          <Fact
            icon="time"
            label="Posted"
            value={`${timeAgo(job.publishedAt)} · closes ${formatDate(job.expiresAt)}`}
          />
          {job.requireQualification ? (
            <Fact icon="qualification" label="Qualification" value="Verified qualification required" />
          ) : null}
        </Card>

        <Section title="About the role">
          <Text color="textSecondary">{job.description}</Text>
        </Section>

        {job.requirements ? (
          <Section title="Requirements">
            <Text color="textSecondary">{job.requirements}</Text>
          </Section>
        ) : null}

        <Section title="About the salon">
          <Card>
            <View style={styles.salon}>
              <SalonLogo name={job.salon.name} uri={job.salon.logoUrl} size={40} />
              <View style={styles.flex}>
                <Text variant="bodyStrong">{job.salon.name}</Text>
                <Text variant="small" color="textSecondary">
                  {job.salon.suburb}, {job.salon.state}
                </Text>
              </View>
            </View>
            {job.salon.verified ? (
              <View style={styles.inline}>
                <VerifiedTick />
                <Text variant="small" color="textSecondary" style={styles.flex}>
                  Verified business — ABN checked against the Australian Business Register.
                </Text>
              </View>
            ) : (
              <Text variant="small" color="textMuted">
                This salon hasn’t completed business verification yet.
              </Text>
            )}
          </Card>
        </Section>
      </ScrollView>

      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            paddingBottom: insets.bottom + Spacing.three,
          },
        ]}>
        {!viewer.applied && !viewer.canApply ? (
          <View style={styles.blocker}>
            <Icon name="shield" size={18} color={theme.warning} />
            <Text variant="small" color="textSecondary" style={styles.flex}>
              {viewer.reason ?? 'You can’t apply for this job yet.'}
            </Text>
          </View>
        ) : null}
        <View style={styles.barRow}>
          <Button
            title={viewer.saved ? 'Saved' : 'Save'}
            icon={viewer.saved ? 'savedFill' : 'saved'}
            variant="outline"
            onPress={toggleSave}
            disabled={saving}
            accessibilityLabel={viewer.saved ? 'Remove from saved jobs' : 'Save job'}
          />
          {viewer.applied ? (
            <Button title="Applied" icon="done" variant="secondary" disabled style={styles.flex} />
          ) : viewer.canApply ? (
            <Button
              title="Apply now"
              style={styles.flex}
              onPress={() =>
                router.push({ pathname: '/apply/[id]', params: { id: job.id, title: job.title } })
              }
            />
          ) : cta ? (
            <Button
              title={cta.label}
              icon={cta.icon}
              style={styles.flex}
              onPress={() => router.push(cta.href)}
            />
          ) : (
            <Button title="Apply now" style={styles.flex} disabled />
          )}
        </View>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={18} color={theme.brand} />
      <View style={styles.flex}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text variant="smallStrong">{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.seven },
  salon: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  salonName: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  facts: { gap: Spacing.four },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  section: { gap: Spacing.two, marginTop: Spacing.two },
  inline: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  barRow: { flexDirection: 'row', gap: Spacing.three },
  blocker: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
});
