import { EMPLOYMENT_TYPES, PAY_PERIODS, type EmploymentType } from '@salonstaff/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { profileSection } from '@/components/needs-profile';
import { Screen } from '@/components/screen';
import { ErrorBanner, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { WeekStrip } from '@/components/week-strip';
import { Spacing } from '@/constants/theme';
import { useMyProfile } from '@/hooks/use-my-profile';
import { ApiProblem, api, errorMessage, type DetailsInput, type SeekerProfile } from '@/lib/api';
import { parseAuDate, toAuDate } from '@/lib/format';
import { currentDetails } from '@/lib/profile-details';

type Field = 'availableFrom' | 'travelKm' | 'payMin';

export default profileSection(AvailabilityScreen);

function AvailabilityScreen() {
  const { data, error, loading, reload } = useMyProfile();
  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;
  return <AvailabilityForm profile={data.profile} />;
}

function AvailabilityForm({ profile }: { profile: SeekerProfile }) {
  const router = useRouter();
  const [days, setDays] = useState<string[]>(profile.availableDays);
  const [types, setTypes] = useState<EmploymentType[]>(profile.employmentTypes);
  const [from, setFrom] = useState(toAuDate(profile.availableFrom));
  const [travel, setTravel] = useState(profile.travelKm?.toString() ?? '');
  const [pay, setPay] = useState(profile.payMin?.toString() ?? '');
  const [period, setPeriod] = useState(profile.payPeriod);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  async function save() {
    setProblem(null);
    const next: Partial<Record<Field, string>> = {};
    const availableFrom = from.trim() ? parseAuDate(from) : '';
    if (availableFrom === null) next.availableFrom = 'Use DD/MM/YYYY';
    const travelKm = travel.trim() ? Number(travel) : null;
    if (travelKm !== null && (!Number.isInteger(travelKm) || travelKm < 0 || travelKm > 500))
      next.travelKm = 'A whole number of km, up to 500';
    const payMin = pay.trim() ? Number(pay) : null;
    if (payMin !== null && (!Number.isFinite(payMin) || payMin < 1 || payMin > 500000))
      next.payMin = 'Enter an amount';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await api.saveDetails({
        ...currentDetails(profile),
        availableDays: days as DetailsInput['availableDays'],
        employmentTypes: types,
        availableFrom: availableFrom ?? '',
        travelKm,
        payMin,
        payPeriod: period,
      });
      router.back();
    } catch (err) {
      if (err instanceof ApiProblem) {
        setErrors({
          availableFrom: err.field('availableFrom'),
          travelKm: err.field('travelKm'),
          payMin: err.field('payMin'),
        });
      }
      setProblem(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Text variant="subheading">Days you can work</Text>
        <WeekStrip days={days} onToggle={(day) => setDays((list) => toggle(list, day))} />
      </Card>
      <Card>
        <Text variant="subheading">Work you’re after</Text>
        <View style={styles.wrap}>
          {EMPLOYMENT_TYPES.map((t) => (
            <Chip
              key={t.value}
              label={t.label}
              selected={types.includes(t.value)}
              onPress={() => setTypes((list) => toggle(list, t.value))}
            />
          ))}
        </View>
      </Card>
      <Card>
        <TextField
          label="Can start from"
          value={from}
          onChangeText={setFrom}
          placeholder="DD/MM/YYYY"
          keyboardType="numbers-and-punctuation"
          hint="Leave blank for now."
          error={errors.availableFrom}
        />
        <TextField
          label="Will travel (km)"
          value={travel}
          onChangeText={(v) => setTravel(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={3}
          error={errors.travelKm}
        />
      </Card>
      <Card>
        <Text variant="subheading">The least you’d take</Text>
        <TextField
          label="Amount ($)"
          value={pay}
          onChangeText={(v) => setPay(v.replace(/[^\d.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="35"
          error={errors.payMin}
        />
        <View style={styles.wrap}>
          {PAY_PERIODS.map((p) => (
            <Chip
              key={p.value}
              label={p.label}
              selected={period === p.value}
              onPress={() => setPeriod(p.value)}
            />
          ))}
        </View>
        <Text variant="caption" color="textMuted">
          Only salons see this, never your share page. Leave it blank if you’d rather not say.
        </Text>
      </Card>
      <ErrorBanner message={problem} />
      <Button title="Save availability and pay" onPress={save} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
