import { PROFILE_LIMITS, SPECIALTIES } from '@salonstaff/shared';
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
import { Spacing } from '@/constants/theme';
import { useMyProfile } from '@/hooks/use-my-profile';
import { ApiProblem, api, errorMessage, type SeekerProfile } from '@/lib/api';
import { currentDetails, splitList } from '@/lib/profile-details';

const ALL_SPECIALTIES: string[] = SPECIALTIES.flatMap((group) => [...group.items]);

export default profileSection(SkillsScreen);

function SkillsScreen() {
  const { data, error, loading, reload } = useMyProfile();
  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;
  return <SkillsForm profile={data.profile} />;
}

function SkillsForm({ profile }: { profile: SeekerProfile }) {
  const router = useRouter();
  const [picked, setPicked] = useState(() =>
    profile.specialties.filter((s) => ALL_SPECIALTIES.includes(s)),
  );
  const [other, setOther] = useState(() =>
    profile.specialties.filter((s) => !ALL_SPECIALTIES.includes(s)).join(', '),
  );
  const [brands, setBrands] = useState(profile.brands.join(', '));
  const [errors, setErrors] = useState<{ specialties?: string; brands?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const specialties = [...picked, ...splitList(other)];
  const full = specialties.length >= PROFILE_LIMITS.specialties;

  function toggle(item: string) {
    setPicked((list) => (list.includes(item) ? list.filter((s) => s !== item) : [...list, item]));
  }

  async function save() {
    setProblem(null);
    const next = {
      specialties:
        specialties.length > PROFILE_LIMITS.specialties
          ? `Up to ${PROFILE_LIMITS.specialties} specialties`
          : undefined,
      brands:
        splitList(brands).length > PROFILE_LIMITS.brands
          ? `Up to ${PROFILE_LIMITS.brands} brands`
          : undefined,
    };
    setErrors(next);
    if (next.specialties || next.brands) return;
    setSaving(true);
    try {
      await api.saveDetails({ ...currentDetails(profile), specialties, brands: splitList(brands) });
      router.back();
    } catch (err) {
      if (err instanceof ApiProblem) {
        setErrors({ specialties: err.field('specialties'), brands: err.field('brands') });
      }
      setProblem(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Text variant="small" color="textSecondary">
        What you’re best at, up to {PROFILE_LIMITS.specialties}, and the brands you’re trained in.
      </Text>
      {SPECIALTIES.map((group) => (
        <Card key={group.group}>
          <Text variant="subheading">{group.group}</Text>
          <View style={styles.wrap}>
            {group.items.map((item) => {
              const selected = picked.includes(item);
              return (
                <Chip
                  key={item}
                  label={item}
                  selected={selected}
                  disabled={!selected && full}
                  onPress={() => toggle(item)}
                />
              );
            })}
          </View>
        </Card>
      ))}
      <TextField
        label="Other specialties"
        value={other}
        onChangeText={setOther}
        hint="Separate them with commas."
        error={errors.specialties}
      />
      <TextField
        label="Brands and products you’re trained in"
        value={brands}
        onChangeText={setBrands}
        placeholder="e.g. Olaplex, Redken"
        hint="Separate them with commas."
        error={errors.brands}
      />
      <ErrorBanner message={problem} />
      <Button title="Save skills" onPress={save} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
