import { EMPLOYMENT_TYPES, JOB_ROLES, RIGHT_TO_WORK, labelFor } from '@salonstaff/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ExperienceTimeline } from '@/components/experience-timeline';
import { ImageViewer } from '@/components/image-viewer';
import { Pill } from '@/components/pill';
import { PortfolioGrid } from '@/components/portfolio-grid';
import { ProfilePhoto } from '@/components/profile-photo';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { api } from '@/lib/api';

/**
 * A job seeker's full profile, as your salon sees it (D-13): someone who applied, or whose profile
 * is open to salons.
 */
export default function CandidateScreen() {
  const { salonId, userId } = useLocalSearchParams<{ salonId: string; userId: string }>();
  const router = useRouter();
  const [photo, setPhoto] = useState<number | null>(null);
  const { data, error, loading, refreshing, reload, refresh } = useRequest(
    () => api.salon.candidate(salonId, userId),
    { key: `${salonId}/${userId}` },
  );

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;
  const { profile: p, verification: v } = data;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: `${p.firstName} ${p.lastName}` }} />
      <Card>
        <View style={styles.header}>
          <ProfilePhoto photoUrl={p.photoUrl} firstName={p.firstName} lastName={p.lastName} size={72} />
          <View style={styles.flex}>
            <Text variant="heading">
              {p.firstName} {p.lastName}
            </Text>
            {p.headline ? <Text color="textSecondary">{p.headline}</Text> : null}
            <Text variant="small" color="textSecondary">
              {p.suburb} {p.state} · {p.yearsExperience} yrs
            </Text>
          </View>
        </View>
        <View style={styles.pills}>
          {p.openToWork ? <Pill label="Open to work" tone="brand" /> : null}
          {v.identity === 'verified' ? <Pill label="ID verified" tone="success" icon="verified" /> : null}
          {v.rightToWork === 'verified' ? <Pill label="Work rights checked" tone="success" /> : null}
          {v.qualification === 'verified' ? <Pill label="Qualification verified" tone="success" /> : null}
        </View>
        <Text variant="small" color="textSecondary">
          {labelFor(RIGHT_TO_WORK, p.rightToWork)}
        </Text>
        {data.contact.message ? (
          <Button
            title="Message"
            icon="chat"
            size="sm"
            onPress={() =>
              router.push({
                pathname: '/hire/conversation/[salonId]/[userId]',
                params: { salonId, userId },
              })
            }
            style={styles.start}
          />
        ) : null}
      </Card>

      {p.about ? (
        <Card>
          <SectionHeader title="About" />
          <Text selectable>{p.about}</Text>
        </Card>
      ) : null}

      <Card>
        <SectionHeader title="Work" />
        <View style={styles.pills}>
          {p.roles.map((role) => (
            <Pill key={role} label={labelFor(JOB_ROLES, role)} />
          ))}
        </View>
        {p.specialties.length ? (
          <Text variant="small" color="textSecondary">
            Specialties: {p.specialties.join(', ')}
          </Text>
        ) : null}
        {p.brands.length ? (
          <Text variant="small" color="textSecondary">
            Brands: {p.brands.join(', ')}
          </Text>
        ) : null}
        {p.employmentTypes.length ? (
          <Text variant="small" color="textSecondary">
            Looking for: {p.employmentTypes.map((t) => labelFor(EMPLOYMENT_TYPES, t)).join(', ')}
          </Text>
        ) : null}
        {p.availableDays.length ? (
          <Text variant="small" color="textSecondary">
            Days: {p.availableDays.join(', ')}
          </Text>
        ) : null}
      </Card>

      {data.portfolio.length ? (
        <Card>
          <SectionHeader title="Portfolio" />
          <PortfolioGrid items={data.portfolio} onPressItem={setPhoto} />
        </Card>
      ) : null}

      {data.experience.length ? (
        <Card>
          <SectionHeader title="Experience" />
          <ExperienceTimeline items={data.experience} />
        </Card>
      ) : null}

      {data.education.length ? (
        <Card>
          <SectionHeader title="Qualifications" />
          {data.education.map((e) => (
            <View key={e.id} style={styles.education}>
              <Text variant="bodyStrong" style={styles.flex}>
                {e.qualification}
                {e.institution ? `, ${e.institution}` : ''}
                {e.year ? ` (${e.year})` : ''}
              </Text>
              {e.verification?.status === 'verified' ? <Pill label="Verified" tone="success" /> : null}
            </View>
          ))}
        </Card>
      ) : null}

      {data.endorsements.length ? (
        <Card>
          <SectionHeader title="Endorsements" />
          {data.endorsements.map((e) => (
            <View key={e.id} style={styles.endorsement}>
              <Text selectable>“{e.body}”</Text>
              <Text variant="small" color="textSecondary">
                {e.refereeName}
                {e.refereeTitle ? `, ${e.refereeTitle}` : ''}
                {e.salonName ? ` · ${e.salonName}` : ''}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <ImageViewer items={data.portfolio} index={photo} onClose={() => setPhoto(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  start: { alignSelf: 'flex-start' },
  education: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  endorsement: { gap: Spacing.one },
});
