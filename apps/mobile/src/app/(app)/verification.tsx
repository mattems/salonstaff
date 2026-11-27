import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { ErrorBanner, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { VerificationBadge } from '@/components/verification-badge';
import { StatusPill, VerificationStep } from '@/components/verification-step';
import { Radius, Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiProblem,
  api,
  errorMessage,
  type Checks,
  type Education,
  type RightToWorkInput,
  type VerificationStatus,
} from '@/lib/api';
import { useAuth, useUser } from '@/lib/auth';
import { VERIFY_RETURN_URL } from '@/lib/config';
import { VERIFICATION_STATUS_LABELS } from '@/lib/format';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const canSubmit = (s: VerificationStatus) => s !== 'verified' && s !== 'pending';

export default function VerificationScreen() {
  const theme = useTheme();
  const { refresh: refreshMe } = useAuth();
  const user = useUser();
  const hasProfile = !!user.profile;
  // Qualifications are the profile's education entries, each checked on its own.
  const { data, error, loading, refreshing, reload, refresh, setData } = useRequest(
    async () => {
      const [checks, profile] = await Promise.all([
        api.checks(),
        hasProfile ? api.profile() : Promise.resolve(null),
      ]);
      return { verification: checks.verification, education: profile?.education ?? [] };
    },
    { refetchOnFocus: true },
  );

  function update(checks: Checks) {
    setData((prev) => (prev ? { ...prev, verification: checks.verification } : prev));
    void refreshMe();
  }

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.brand}
            colors={[theme.brand]}
          />
        }>
        <View style={[styles.why, { backgroundColor: theme.brandSoft }]}>
          <Icon name="shield" size={22} color={theme.brand} />
          <View style={styles.flex}>
            <Text variant="subheading" color="brand">
              Salons only see real, verified people
            </Text>
            <Text variant="small" color="textSecondary">
              Verifying keeps bots and fake profiles off Salon Staff, so salons trust every
              application they get — including yours. Your documents are checked securely and never
              shown to salons.
            </Text>
          </View>
        </View>

        <VerificationBadge level={data.verification.level} />

        <IdentityStep
          status={data.verification.identity}
          hasProfile={hasProfile}
          onDone={async () => {
            await reload();
            await refreshMe();
          }}
        />
        <RightToWorkStep status={data.verification.rightToWork} onUpdated={update} />
        <QualificationStep
          status={data.verification.qualification}
          hasProfile={hasProfile}
          education={data.education}
          onUpdated={async () => {
            await reload();
            await refreshMe();
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------- (a) Identity ----------

function IdentityStep({
  status,
  hasProfile,
  onDone,
}: {
  status: VerificationStatus;
  hasProfile: boolean;
  onDone: () => Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const { url } = await api.startIdentity(VERIFY_RETURN_URL);
      await WebBrowser.openAuthSessionAsync(url, VERIFY_RETURN_URL);
      // Whatever the browser result, the server is the source of truth.
      await onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const label =
    status === 'failed'
      ? 'Try again'
      : status === 'requires_input'
        ? 'Continue verification'
        : 'Verify my identity';

  return (
    <VerificationStep
      step={1}
      icon="identity"
      title="Identity"
      status={status}
      description={
        status === 'verified'
          ? 'Your ID has been verified. Salons see your “ID verified” badge.'
          : status === 'pending'
            ? 'We’re reviewing your ID. This usually takes a few minutes.'
            : 'Scan your driver licence or passport and take a quick selfie. Takes about 2 minutes.'
      }>
      <ErrorBanner message={error} />
      {status === 'pending' ? (
        <Button title="Check status" variant="outline" onPress={onDone} />
      ) : status !== 'verified' && !hasProfile ? (
        <>
          <Text variant="small" color="textSecondary">
            Set up your profile first: we check the name on your ID against it.
          </Text>
          <Button
            title="Set up profile"
            variant="secondary"
            onPress={() => router.push('/edit-profile')}
          />
        </>
      ) : status !== 'verified' ? (
        <Button title={label} icon="shield" loading={busy} onPress={start} />
      ) : null}
    </VerificationStep>
  );
}

// ---------- (b) Right to work ----------

const BASIS_OPTIONS: { value: RightToWorkInput['basis']; label: string }[] = [
  { value: 'citizen', label: 'Citizen' },
  { value: 'permanent_resident', label: 'Permanent resident' },
  { value: 'visa', label: 'Visa holder' },
];

function RightToWorkStep({
  status,
  onUpdated,
}: {
  status: VerificationStatus;
  onUpdated: (checks: Checks) => void;
}) {
  const [basis, setBasis] = useState<RightToWorkInput['basis'] | undefined>();
  const [visaGrantNumber, setVisaGrantNumber] = useState('');
  const [passportCountry, setPassportCountry] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    const next: Record<string, string> = {};
    if (!basis) next.basis = 'Choose one';
    if (basis === 'visa') {
      if (!visaGrantNumber.trim()) next.visaGrantNumber = 'Enter your visa grant number';
      if (!passportCountry.trim()) next.passportCountry = 'Enter your passport country';
    }
    setErrors(next);
    if (Object.keys(next).length || !basis) return;

    const input: RightToWorkInput =
      basis === 'visa'
        ? { basis, visaGrantNumber: visaGrantNumber.trim(), passportCountry: passportCountry.trim() }
        : { basis };

    setBusy(true);
    try {
      onUpdated(await api.rightToWork(input));
    } catch (err) {
      if (err instanceof ApiProblem && err.errors.length) {
        setErrors(Object.fromEntries(err.errors.map((e) => [e.path, e.message])));
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <VerificationStep
      step={2}
      icon="rightToWork"
      title="Right to work"
      status={status}
      description={
        status === 'verified'
          ? 'Your work rights are confirmed — you’re work-ready.'
          : status === 'pending'
            ? 'We’re confirming your work rights. We’ll update your badge when it’s done.'
            : 'Confirm you can legally work in Australia. Visa holders are checked against VEVO.'
      }>
      {canSubmit(status) ? (
        <View style={styles.form}>
          <View style={styles.wrap}>
            {BASIS_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={basis === o.value}
                onPress={() => {
                  setBasis(o.value);
                  setErrors({});
                }}
              />
            ))}
          </View>
          {errors.basis ? (
            <Text variant="caption" color="danger">
              {errors.basis}
            </Text>
          ) : null}
          {basis === 'visa' ? (
            <>
              <TextField
                label="Visa grant number"
                value={visaGrantNumber}
                onChangeText={setVisaGrantNumber}
                keyboardType="number-pad"
                hint="On your visa grant notice (13 digits)."
                error={errors.visaGrantNumber}
              />
              <TextField
                label="Passport country"
                value={passportCountry}
                onChangeText={setPassportCountry}
                placeholder="e.g. United Kingdom"
                autoComplete="country"
                error={errors.passportCountry}
              />
            </>
          ) : null}
          <ErrorBanner message={error} />
          <Button title="Submit" onPress={submit} loading={busy} variant="secondary" />
        </View>
      ) : null}
    </VerificationStep>
  );
}

// ---------- (c) Qualifications ----------

type PickedFile = { uri: string; name: string; size?: number };

/** A certificate can be sent for an entry that has none, or whose check needs another go. */
const canSendCertificate = (entry: Education) =>
  !entry.verification || canSubmit(entry.verification.status);

async function pickCertificate(): Promise<PickedFile | { tooBig: true } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: UPLOAD_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  if (asset.size && asset.size > MAX_UPLOAD_BYTES) return { tooBig: true };
  return { uri: asset.uri, name: asset.name, size: asset.size };
}

const TOO_BIG = 'That file is over 8MB. Try a smaller scan or photo.';

function QualificationStep({
  status,
  hasProfile,
  education,
  onUpdated,
}: {
  status: VerificationStatus;
  hasProfile: boolean;
  education: Education[];
  onUpdated: () => Promise<void>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <VerificationStep
      step={3}
      icon="qualification"
      title="Qualifications"
      status={status}
      description={
        status === 'verified'
          ? 'A qualification is verified. Some salons require this to apply.'
          : status === 'pending'
            ? 'We’re reviewing your certificate.'
            : 'Send the certificate for a qualification (PDF, JPG or PNG, up to 8MB). Some jobs require a verified qualification.'
      }>
      {!hasProfile ? (
        <>
          <Text variant="small" color="textSecondary">
            Set up your profile first, then add your qualifications.
          </Text>
          <Button
            title="Set up profile"
            variant="secondary"
            onPress={() => router.push('/edit-profile')}
          />
        </>
      ) : (
        <View style={styles.form}>
          {education.map((entry) => (
            <QualificationRow key={entry.id} entry={entry} onUpdated={onUpdated} />
          ))}
          {adding || education.length === 0 ? (
            <AddQualification
              existing={education}
              onCancel={education.length ? () => setAdding(false) : undefined}
              onUpdated={async () => {
                setAdding(false);
                await onUpdated();
              }}
            />
          ) : (
            <Button
              title="Add a qualification"
              variant="ghost"
              size="sm"
              onPress={() => setAdding(true)}
            />
          )}
        </View>
      )}
    </VerificationStep>
  );
}

/** One qualification on the profile, with its check and a way to send its certificate. */
function QualificationRow({ entry, onUpdated }: { entry: Education; onUpdated: () => Promise<void> }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = entry.verification;

  async function send() {
    setError(null);
    const picked = await pickCertificate();
    if (!picked) return;
    if ('tooBig' in picked) {
      setError(TOO_BIG);
      return;
    }
    setBusy(true);
    try {
      await api.uploadQualification({ blob: new File(picked.uri), name: picked.name }, entry.id);
      await onUpdated();
      Alert.alert('Sent', 'Thanks! We’ll review your certificate shortly.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.entry, { borderColor: theme.border }]}>
      <View style={styles.entryRow}>
        <View style={styles.flex}>
          <Text variant="smallStrong">{entry.qualification}</Text>
          <Text variant="caption" color="textMuted">
            {[entry.institution, entry.year].filter(Boolean).join(' · ') ||
              (check ? VERIFICATION_STATUS_LABELS[check.status] : 'No certificate sent')}
          </Text>
        </View>
        {check ? <StatusPill status={check.status} /> : null}
      </View>
      {check?.reference ? (
        <Text variant="caption" color="textMuted">
          Verification ID {check.reference}
        </Text>
      ) : null}
      <ErrorBanner message={error} />
      {canSendCertificate(entry) ? (
        <Button
          title={check ? 'Send a new certificate' : 'Send certificate'}
          icon="upload"
          size="sm"
          variant="outline"
          loading={busy}
          onPress={send}
        />
      ) : null}
    </View>
  );
}

/** A new qualification (an education entry) and its certificate, sent together. */
function AddQualification({
  existing,
  onCancel,
  onUpdated,
}: {
  existing: Education[];
  onCancel?: () => void;
  onUpdated: () => Promise<void>;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [institution, setInstitution] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [errors, setErrors] = useState<{ title?: string; file?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick() {
    setErrors((e) => ({ ...e, file: undefined }));
    const picked = await pickCertificate();
    if (!picked) return;
    if ('tooBig' in picked) setErrors((e) => ({ ...e, file: TOO_BIG }));
    else setFile(picked);
  }

  async function save() {
    setError(null);
    const next: typeof errors = {};
    if (!title.trim()) next.title = 'Add its name, e.g. Cert III in Hairdressing';
    if (!file) next.file = 'Choose a PDF, JPG or PNG';
    setErrors(next);
    if (next.title || next.file || !file) return;

    setBusy(true);
    try {
      const before = new Set(existing.map((e) => e.id));
      const profile = await api.addEducation({
        qualification: title.trim(),
        institution: institution.trim() || undefined,
      });
      const added = profile.education.find((e) => !before.has(e.id));
      if (added) {
        await api.uploadQualification({ blob: new File(file.uri), name: file.name }, added.id);
      }
      await onUpdated();
      Alert.alert('Sent', 'Thanks! We’ll review your qualification shortly.');
    } catch (err) {
      if (err instanceof ApiProblem && err.errors.length) {
        setErrors({ title: err.field('qualification'), file: err.field('file') });
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextField
        label="Qualification"
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          setErrors((e) => ({ ...e, title: undefined }));
        }}
        placeholder="e.g. Cert III in Hairdressing"
        maxLength={120}
        error={errors.title}
      />
      <TextField
        label="Where you studied (optional)"
        value={institution}
        onChangeText={setInstitution}
        placeholder="e.g. TAFE NSW"
        maxLength={120}
      />
      <View
        style={[
          styles.file,
          { borderColor: errors.file ? theme.danger : theme.border, backgroundColor: theme.surfaceMuted },
        ]}>
        <Icon name="upload" size={20} color={theme.textSecondary} />
        <View style={styles.flex}>
          <Text variant="smallStrong" numberOfLines={1}>
            {file ? file.name : 'No certificate chosen'}
          </Text>
          <Text variant="caption" color={errors.file ? 'danger' : 'textMuted'}>
            {errors.file ??
              (file?.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'PDF, JPG or PNG')}
          </Text>
        </View>
        <Button title={file ? 'Change' : 'Choose'} size="sm" variant="outline" onPress={pick} />
      </View>
      <ErrorBanner message={error} />
      <Button title="Add and send" onPress={save} loading={busy} variant="secondary" />
      {onCancel ? <Button title="Cancel" variant="ghost" size="sm" onPress={onCancel} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.seven },
  why: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.lg,
  },
  form: { gap: Spacing.three },
  entry: { gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.md, borderWidth: 1 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
