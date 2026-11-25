import { EMPLOYMENT_TYPES, formatPay, labelFor, type JobSummary } from '@salonstaff/shared';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { VerifiedTick } from '@/components/verified-tick';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { timeAgo } from '@/lib/format';

export function SalonLogo({ name, uri, size = 44 }: { name: string; uri: string | null; size?: number }) {
  const theme = useTheme();
  const style = { width: size, height: size, borderRadius: size / 4 };
  if (uri) {
    return <Image source={{ uri }} style={[style, { backgroundColor: theme.surfaceMuted }]} contentFit="cover" />;
  }
  return (
    <View style={[style, styles.logoFallback, { backgroundColor: theme.brandSoft }]}>
      <Text variant="subheading" color="brand">
        {name.trim().charAt(0).toUpperCase() || '•'}
      </Text>
    </View>
  );
}

export function JobCard({ job, footer }: { job: JobSummary; footer?: React.ReactNode }) {
  const theme = useTheme();
  const router = useRouter();
  const pay = formatPay(job.payMin, job.payMax, job.payPeriod);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.title} at ${job.salon.name}`}
      onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: job.featured ? theme.brand : theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <View style={styles.header}>
        <SalonLogo name={job.salon.name} uri={job.salon.logoUrl} />
        <View style={styles.headerText}>
          <Text variant="subheading" numberOfLines={2}>
            {job.title}
          </Text>
          <View style={styles.salonRow}>
            <Text variant="small" color="textSecondary" numberOfLines={1} style={styles.shrink}>
              {job.salon.name}
            </Text>
            {job.salon.verified ? <VerifiedTick /> : null}
          </View>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Meta icon="location" text={`${job.suburb}, ${job.state}`} />
        {pay ? <Meta icon="pay" text={pay} /> : null}
      </View>

      <View style={styles.footerRow}>
        <View style={styles.pills}>
          {job.featured ? <Pill label="Featured" tone="brand" icon="star" /> : null}
          <Pill label={labelFor(EMPLOYMENT_TYPES, job.employmentType)} />
        </View>
        <Text variant="caption" color="textMuted">
          {timeAgo(job.publishedAt)}
        </Text>
      </View>
      {footer}
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: 'location' | 'pay'; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.meta}>
      <Icon name={icon} size={14} color={theme.textMuted} />
      <Text variant="small" color="textSecondary" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  headerText: { flex: 1, gap: 2 },
  salonRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  shrink: { flexShrink: 1 },
  logoFallback: { alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.four, rowGap: Spacing.one },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pills: { flexDirection: 'row', gap: Spacing.two, flexShrink: 1, flexWrap: 'wrap' },
});
