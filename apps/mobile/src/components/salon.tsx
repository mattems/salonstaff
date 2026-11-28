/**
 * Pieces of the salon side (D-20): statuses, the salon filter when you're on several, and the rows
 * of its lists.
 */
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  labelFor,
} from '@salonstaff/shared';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Pill, type Tone } from '@/components/pill';
import { Text } from '@/components/text';
import { VerifiedTick } from '@/components/verified-tick';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { SalonApplicant, SalonJob } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';

export const APPLICATION_TONES: Record<ApplicationStatus, Tone> = {
  submitted: 'brand',
  viewed: 'info',
  shortlisted: 'brand',
  interview: 'warning',
  hired: 'success',
  declined: 'neutral',
};

/** "New" for a submitted application, as the website says. */
export const applicationLabel = (status: ApplicationStatus) =>
  status === 'submitted' ? 'New' : labelFor(APPLICATION_STATUSES, status);

export const JOB_STATUS: Record<SalonJob['status'], { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Live', tone: 'success' },
  expired: { label: 'Expired', tone: 'warning' },
  closed: { label: 'Closed', tone: 'neutral' },
};

/** All your salons, or one: shown only when you're on more than one. */
export function SalonChips({
  salons,
  value,
  onChange,
}: {
  salons: { id: string; name: string }[];
  value: string | undefined;
  onChange: (salonId: string | undefined) => void;
}) {
  if (salons.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}>
      <Chip label="All salons" selected={!value} onPress={() => onChange(undefined)} />
      {salons.map((salon) => (
        <Chip
          key={salon.id}
          label={salon.name}
          selected={value === salon.id}
          onPress={() => onChange(salon.id)}
        />
      ))}
    </ScrollView>
  );
}

export function JobRow({
  job,
  showSalon,
  onPress,
}: {
  job: SalonJob;
  showSalon: boolean;
  onPress: () => void;
}) {
  const status = JOB_STATUS[job.status];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${status.label}, ${job.applicants} applicants`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {job.title}
          </Text>
          <Pill label={status.label} tone={status.tone} />
        </View>
        <Text variant="small" color="textSecondary" numberOfLines={1}>
          {showSalon ? `${job.salon.name} · ` : ''}
          {job.suburb} {job.state}
        </Text>
        <Text variant="caption" color="textMuted">
          {job.applicants} {job.applicants === 1 ? 'applicant' : 'applicants'}
          {job.newApplicants > 0 ? ` · ${job.newApplicants} new` : ''}
          {job.status === 'published' && job.expiresAt
            ? ` · live until ${formatDate(job.expiresAt)}`
            : ''}
        </Text>
      </View>
    </Pressable>
  );
}

export function ApplicantRow({
  applicant,
  showSalon,
  onPress,
}: {
  applicant: SalonApplicant;
  showSalon: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const person = applicant.candidate;
  const name = person ? `${person.firstName} ${person.lastName}` : 'Deleted account';
  const v = applicant.verification;
  const verified = v.identity === 'verified' && v.rightToWork === 'verified';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${applicationLabel(applicant.status)}${applicant.unreadMessages ? ', unread messages' : ''}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <View
        style={[
          styles.dot,
          { backgroundColor: applicant.unreadMessages > 0 ? theme.brand : 'transparent' },
        ]}
      />
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.shrink}>
            {name}
          </Text>
          {verified ? <VerifiedTick /> : null}
          <View style={styles.flex} />
          <Pill
            label={applicationLabel(applicant.status)}
            tone={APPLICATION_TONES[applicant.status]}
          />
        </View>
        <Text variant="small" color="textSecondary" numberOfLines={1}>
          {applicant.job.title}
          {showSalon ? ` · ${applicant.salon.name}` : ''}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {person?.headline ? `${person.headline} · ` : ''}
          {person ? `${person.yearsExperience ?? 0} yrs · ` : ''}
          Applied {timeAgo(applicant.createdAt)}
          {applicant.unreadMessages > 0
            ? ` · ${applicant.unreadMessages} unread ${applicant.unreadMessages === 1 ? 'reply' : 'replies'}`
            : ''}
        </Text>
      </View>
    </Pressable>
  );
}

export function Separator() {
  const theme = useTheme();
  return <View style={[styles.separator, { backgroundColor: theme.border }]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  chips: { gap: Spacing.two, paddingBottom: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.three },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  separator: { height: StyleSheet.hairlineWidth },
});
