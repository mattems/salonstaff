import {
  AU_STATES,
  JOB_ROLES,
  nameChangeExpiresIdentity,
  RIGHT_TO_WORK,
  seekerProfileSchema,
  type SeekerProfileInput,
  type AuState,
  type JobRole,
  type RightToWork,
} from '@salonstaff/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { ErrorBanner } from '@/components/state-views';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { YearsStepper } from '@/components/years-stepper';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiProblem, api, errorMessage, type SeekerProfile } from '@/lib/api';
import { useAuth, useUser } from '@/lib/auth';

const MAX_ROLES = 6;

type Form = {
  firstName: string;
  lastName: string;
  headline: string;
  about: string;
  suburb: string;
  state: AuState | undefined;
  postcode: string;
  roles: JobRole[];
  yearsExperience: string;
  instagram: string;
  tiktok: string;
  rightToWork: RightToWork | undefined;
  openToWork: boolean;
};

type FieldErrors = Partial<Record<keyof Form, string>>;

function initialForm(p: SeekerProfile | null): Form {
  return {
    firstName: p?.firstName ?? '',
    lastName: p?.lastName ?? '',
    headline: p?.headline ?? '',
    about: p?.about ?? '',
    suburb: p?.suburb ?? '',
    state: p?.state,
    postcode: p?.postcode ?? '',
    roles: p?.roles ?? [],
    yearsExperience: p ? String(p.yearsExperience) : '',
    instagram: p?.instagram ?? '',
    tiktok: p?.tiktok ?? '',
    rightToWork: p?.rightToWork,
    openToWork: p?.openToWork ?? true,
  };
}

/** Friendlier messages for zod's generic enum/number errors. */
const FALLBACK_MESSAGES: Partial<Record<keyof Form, string>> = {
  state: 'Choose your state',
  rightToWork: 'Choose your work rights',
  yearsExperience: 'Enter a whole number of years (0–60)',
  roles: `Pick between 1 and ${MAX_ROLES} roles`,
};

export default function EditProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useUser();
  const { refresh } = useAuth();

  const [form, setForm] = useState<Form>(() => initialForm(user.profile));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function toggleRole(role: JobRole) {
    const has = form.roles.includes(role);
    if (!has && form.roles.length >= MAX_ROLES) return;
    set('roles', has ? form.roles.filter((r) => r !== role) : [...form.roles, role]);
  }

  async function save() {
    setFormError(null);
    const raw = {
      ...form,
      instagram: form.instagram.trim().replace(/^@+/, ''),
      tiktok: form.tiktok.trim().replace(/^@+/, ''),
      yearsExperience: form.yearsExperience.trim() === '' ? undefined : form.yearsExperience.trim(),
    };
    const parsed = seekerProfileSchema.safeParse(raw);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Form | undefined;
        if (!key || next[key]) continue;
        const generic = issue.code === 'invalid_value' || issue.code === 'invalid_type';
        next[key] = (generic && FALLBACK_MESSAGES[key]) || issue.message;
      }
      setErrors(next);
      setFormError('Please fix the highlighted fields.');
      return;
    }

    const before = user.profile;
    const expiresId =
      user.verification.identity === 'verified' &&
      !!before &&
      nameChangeExpiresIdentity(before, parsed.data);
    if (expiresId) {
      Alert.alert(
        'Verify your ID again?',
        `Your ID was checked against the name ${before.firstName} ${before.lastName}. With a new name you’ll need to verify your ID again, and salons won’t see you as verified until you do.`,
        [
          { text: 'Keep my name', style: 'cancel' },
          { text: 'Change it', style: 'destructive', onPress: () => void persist(parsed.data, true) },
        ],
      );
      return;
    }
    await persist(parsed.data, false);
  }

  async function persist(input: SeekerProfileInput, expiresId: boolean) {
    setSaving(true);
    try {
      await api.saveProfile(input);
      await refresh();
      if (expiresId) router.replace('/verification');
      else router.back();
    } catch (err) {
      if (err instanceof ApiProblem && err.errors.length) {
        const next: FieldErrors = {};
        for (const { path, message } of err.errors) {
          const key = path.split('.')[0] as keyof Form;
          next[key] ??= message;
        }
        setErrors(next);
      }
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic">

        <Section title="About you">
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField
                label="First name"
                value={form.firstName}
                onChangeText={(v) => set('firstName', v)}
                autoComplete="given-name"
                textContentType="givenName"
                error={errors.firstName}
              />
            </View>
            <View style={styles.flex}>
              <TextField
                label="Last name"
                value={form.lastName}
                onChangeText={(v) => set('lastName', v)}
                autoComplete="family-name"
                textContentType="familyName"
                error={errors.lastName}
              />
            </View>
          </View>
          {user.verification.identity === 'verified' ? (
            <Text variant="caption" color="textMuted">
              Your ID is verified with this name. Changing it means verifying your ID again.
            </Text>
          ) : null}
          <TextField
            label="Headline"
            value={form.headline}
            onChangeText={(v) => set('headline', v)}
            placeholder="e.g. Senior colourist, balayage specialist"
            maxLength={120}
            error={errors.headline}
          />
          <TextField
            label="About"
            value={form.about}
            onChangeText={(v) => set('about', v)}
            placeholder="Your experience, specialties and what you’re looking for."
            multiline
            maxLength={2000}
            error={errors.about}
          />
        </Section>

        <Section title="Location">
          <View style={styles.row}>
            <View style={styles.grow2}>
              <TextField
                label="Suburb"
                value={form.suburb}
                onChangeText={(v) => set('suburb', v)}
                autoComplete="postal-address-locality"
                error={errors.suburb}
              />
            </View>
            <View style={styles.flex}>
              <TextField
                label="Postcode"
                value={form.postcode}
                onChangeText={(v) => set('postcode', v.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={4}
                autoComplete="postal-code"
                error={errors.postcode}
              />
            </View>
          </View>
          <FieldLabel label="State" error={errors.state} />
          <View style={styles.wrap}>
            {AU_STATES.map((s) => (
              <Chip
                key={s.value}
                label={s.value}
                selected={form.state === s.value}
                onPress={() => set('state', s.value)}
              />
            ))}
          </View>
        </Section>

        <Section title="Work">
          <FieldLabel
            label={`Roles you’re after (${form.roles.length}/${MAX_ROLES})`}
            error={errors.roles}
          />
          <View style={styles.wrap}>
            {JOB_ROLES.map((r) => {
              const selected = form.roles.includes(r.value);
              return (
                <Chip
                  key={r.value}
                  label={r.label}
                  selected={selected}
                  disabled={!selected && form.roles.length >= MAX_ROLES}
                  onPress={() => toggleRole(r.value)}
                />
              );
            })}
          </View>
          <YearsStepper
            years={Number(form.yearsExperience) || 0}
            onChange={(years) => set('yearsExperience', String(years))}
          />
          <TextField
            label="Instagram"
            value={form.instagram}
            onChangeText={(v) => set('instagram', v)}
            placeholder="@yourhandle"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={60}
            hint="Optional. A great way to show your work."
            error={errors.instagram}
          />
          <TextField
            label="TikTok"
            value={form.tiktok}
            onChangeText={(v) => set('tiktok', v)}
            placeholder="@yourhandle"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={60}
            hint="Optional."
            error={errors.tiktok}
          />
        </Section>

        <Section title="Right to work in Australia">
          {errors.rightToWork ? (
            <Text variant="caption" color="danger">
              {errors.rightToWork}
            </Text>
          ) : null}
          <Card style={styles.radioCard}>
            {RIGHT_TO_WORK.map((opt, i) => {
              const selected = form.rightToWork === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => set('rightToWork', opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[
                    styles.radioRow,
                    i > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
                  ]}>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: selected ? theme.brand : theme.border },
                    ]}>
                    {selected ? <View style={[styles.radioDot, { backgroundColor: theme.brand }]} /> : null}
                  </View>
                  <Text variant="body" style={styles.flex}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </Card>
        </Section>

        <Card style={styles.switchRow}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">Open to work</Text>
            <Text variant="small" color="textSecondary">
              Let salons know you’re available for new roles.
            </Text>
          </View>
          <Switch
            value={form.openToWork}
            onValueChange={(v) => set('openToWork', v)}
            trackColor={{ true: theme.brand, false: theme.border }}
            thumbColor={Platform.OS === 'android' ? theme.surface : undefined}
          />
        </Card>

        <ErrorBanner message={formError} />
        <Button title="Save profile" onPress={save} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" color="textMuted">
        {title}
      </Text>
      {children}
    </View>
  );
}

function FieldLabel({ label, error }: { label: string; error?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.fieldLabel}>
      <Text variant="smallStrong" color="textSecondary">
        {label}
      </Text>
      {error ? (
        <View style={styles.inlineError}>
          <Icon name="error" size={12} color={theme.danger} />
          <Text variant="caption" color="danger">
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow2: { flex: 2 },
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.seven },
  section: { gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  fieldLabel: { gap: 2 },
  inlineError: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  radioCard: { paddingVertical: 0, gap: 0 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 52 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
});
