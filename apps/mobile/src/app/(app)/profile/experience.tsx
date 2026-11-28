import { educationSchema, experienceSchema, PROFILE_LIMITS } from '@salonstaff/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DateField, monthFromDate } from '@/components/date-field';
import { ExperienceTimeline } from '@/components/experience-timeline';
import { Icon } from '@/components/icon';
import { profileSection } from '@/components/needs-profile';
import { Screen } from '@/components/screen';
import { ErrorBanner, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { StatusPill } from '@/components/verification-step';
import { Spacing } from '@/constants/theme';
import { useMyProfile } from '@/hooks/use-my-profile';
import { useTheme } from '@/hooks/use-theme';
import { ApiProblem, api, errorMessage, type MyProfile } from '@/lib/api';

export default profileSection(ExperienceScreen);

function ExperienceScreen() {
  const { data, error, loading, refreshing, reload, refresh, setData } = useMyProfile();
  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;
  const update = (next: MyProfile) => setData(() => next);
  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ExperienceCard full={data} onChange={update} />
      <EducationCard full={data} onChange={update} />
    </Screen>
  );
}

/** Asks first, then removes; the API answers with the whole profile. */
function confirmRemove(what: string, remove: () => Promise<MyProfile>, onChange: (p: MyProfile) => void) {
  Alert.alert(`Remove ${what}?`, undefined, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Remove',
      style: 'destructive',
      onPress: async () => {
        try {
          onChange(await remove());
        } catch (err) {
          Alert.alert('Couldn’t remove it', errorMessage(err));
        }
      },
    },
  ]);
}

function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={label}>
      <Icon name="trash" size={18} color={theme.textMuted} />
    </Pressable>
  );
}

type Errors = Record<string, string | undefined>;

function issuesOf(issues: { path: PropertyKey[]; message: string }[]): Errors {
  const out: Errors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    out[key] ??= issue.message;
  }
  return out;
}

// ---------- Experience ----------

function ExperienceCard({ full, onChange }: { full: MyProfile; onChange: (p: MyProfile) => void }) {
  const [adding, setAdding] = useState(full.experience.length === 0);
  const theme = useTheme();
  const blank = () => ({ title: '', salonName: '', location: '', description: '' });
  const [form, setForm] = useState(blank);
  // Picked with the phone's date picker; only the month is kept.
  const [start, setStart] = useState(() => new Date());
  const [end, setEnd] = useState(() => new Date());
  const [stillThere, setStillThere] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canAdd = full.experience.length < PROFILE_LIMITS.experience;

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function add() {
    setProblem(null);
    const parsed = experienceSchema.safeParse({
      title: form.title,
      salonName: form.salonName,
      location: form.location,
      startMonth: monthFromDate(start),
      endMonth: stillThere ? '' : monthFromDate(end),
      description: form.description,
    });
    if (!parsed.success) {
      const found = issuesOf(parsed.error.issues);
      setErrors(found);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      onChange(await api.addExperience(parsed.data));
      setForm(blank());
      setStillThere(true);
      setAdding(false);
    } catch (err) {
      if (err instanceof ApiProblem) setErrors(Object.fromEntries(err.errors.map((e) => [e.path, e.message])));
      setProblem(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Text variant="subheading">Experience</Text>
      {full.experience.length ? (
        <ExperienceTimeline
          items={full.experience}
          renderAction={(item) => (
            <RemoveButton
              label={`Remove ${item.title}`}
              onPress={() =>
                confirmRemove(item.title, () => api.removeExperience(item.id), onChange)
              }
            />
          )}
        />
      ) : null}
      {adding && canAdd ? (
        <View style={styles.form}>
          <TextField label="Job title" value={form.title} onChangeText={set('title')} error={errors.title} />
          <TextField label="Salon" value={form.salonName} onChangeText={set('salonName')} error={errors.salonName} />
          <TextField label="Where (optional)" value={form.location} onChangeText={set('location')} error={errors.location} />
          <DateField
            label="Started"
            value={start}
            onChange={setStart}
            maximumDate={new Date()}
            error={errors.startMonth}
          />
          <View style={styles.switchRow}>
            <Text style={styles.flex}>I still work here</Text>
            <Switch
              value={stillThere}
              onValueChange={setStillThere}
              trackColor={{ true: theme.brand, false: theme.border }}
              thumbColor={Platform.OS === 'android' ? theme.surface : undefined}
            />
          </View>
          {stillThere ? null : (
            <DateField
              label="Finished"
              value={end}
              onChange={setEnd}
              minimumDate={start}
              maximumDate={new Date()}
              error={errors.endMonth}
            />
          )}
          <TextField
            label="What you did (optional)"
            value={form.description}
            onChangeText={set('description')}
            multiline
            maxLength={1000}
            error={errors.description}
          />
          <ErrorBanner message={problem} />
          <Button title="Add experience" onPress={add} loading={saving} variant="secondary" />
          {full.experience.length ? (
            <Button title="Cancel" variant="ghost" size="sm" onPress={() => setAdding(false)} />
          ) : null}
        </View>
      ) : canAdd ? (
        <Button title="Add a role" icon="add" variant="ghost" size="sm" onPress={() => setAdding(true)} />
      ) : null}
    </Card>
  );
}

// ---------- Qualifications ----------

function EducationCard({ full, onChange }: { full: MyProfile; onChange: (p: MyProfile) => void }) {
  const router = useRouter();
  const theme = useTheme();
  const [adding, setAdding] = useState(full.education.length === 0);
  const [form, setForm] = useState({ qualification: '', institution: '', year: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canAdd = full.education.length < PROFILE_LIMITS.education;

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function add() {
    setProblem(null);
    const parsed = educationSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(issuesOf(parsed.error.issues));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      onChange(await api.addEducation(parsed.data));
      setForm({ qualification: '', institution: '', year: '' });
      setAdding(false);
    } catch (err) {
      if (err instanceof ApiProblem) setErrors(Object.fromEntries(err.errors.map((e) => [e.path, e.message])));
      setProblem(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Text variant="subheading">Qualifications</Text>
      <Text variant="small" color="textSecondary">
        Certificates, diplomas and courses. Send a certificate from the Verification centre and the
        qualification shows as verified on your profile.
      </Text>
      {full.education.map((item) => (
        <View key={item.id} style={[styles.entry, { borderColor: theme.border }]}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">{item.qualification}</Text>
            {item.institution || item.year ? (
              <Text variant="small" color="textSecondary">
                {[item.institution, item.year].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          {item.verification ? <StatusPill status={item.verification.status} /> : null}
          <RemoveButton
            label={`Remove ${item.qualification}`}
            onPress={() =>
              confirmRemove(item.qualification, () => api.removeEducation(item.id), onChange)
            }
          />
        </View>
      ))}
      {full.education.some((e) => !e.verification) ? (
        <Button
          title="Verify a qualification"
          icon="qualification"
          variant="outline"
          size="sm"
          onPress={() => router.push('/verification')}
        />
      ) : null}
      {adding && canAdd ? (
        <View style={styles.form}>
          <TextField
            label="Qualification or course"
            value={form.qualification}
            onChangeText={set('qualification')}
            placeholder="e.g. Cert III in Hairdressing"
            error={errors.qualification}
          />
          <View style={styles.row}>
            <View style={styles.grow2}>
              <TextField
                label="Where (optional)"
                value={form.institution}
                onChangeText={set('institution')}
                placeholder="TAFE NSW"
                error={errors.institution}
              />
            </View>
            <View style={styles.flex}>
              <TextField
                label="Year"
                value={form.year}
                onChangeText={(v) => set('year')(v.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={4}
                error={errors.year}
              />
            </View>
          </View>
          <ErrorBanner message={problem} />
          <Button title="Add qualification" onPress={add} loading={saving} variant="secondary" />
          {full.education.length ? (
            <Button title="Cancel" variant="ghost" size="sm" onPress={() => setAdding(false)} />
          ) : null}
        </View>
      ) : canAdd ? (
        <Button
          title="Add a qualification"
          icon="add"
          variant="ghost"
          size="sm"
          onPress={() => setAdding(true)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
  grow2: { flex: 2 },
  form: { gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
