import type { VerificationStatus, VerificationSummary } from '@salonstaff/shared';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
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
import { VerificationStep } from '@/components/verification-step';
import { Radius, Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { ApiClientError, api, errorMessage, type RightToWorkInput } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { VERIFY_RETURN_URL } from '@/lib/config';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const canSubmit = (s: VerificationStatus) => s !== 'verified' && s !== 'pending';

export default function VerificationScreen() {
  const theme = useTheme();
  const { refresh: refreshMe } = useAuth();
  const { data, error, loading, refreshing, reload, refresh, setData } = useRequest(
    api.verification,
    { refetchOnFocus: true },
  );

  function update(summary: VerificationSummary) {
    setData(() => summary);
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

        <VerificationBadge level={data.level} />

        <IdentityStep status={data.identity} onDone={async () => {
          await reload();
          await refreshMe();
        }} />
        <RightToWorkStep status={data.rightToWork} onUpdated={update} />
        <QualificationStep status={data.qualification} onUpdated={update} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------- (a) Identity ----------

function IdentityStep({ status, onDone }: { status: VerificationStatus; onDone: () => Promise<void> }) {
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
  onUpdated: (s: VerificationSummary) => void;
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
      if (err instanceof ApiClientError && err.fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]])));
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

// ---------- (c) Qualification ----------

type PickedFile = { uri: string; name: string; size?: number };

function QualificationStep({
  status,
  onUpdated,
}: {
  status: VerificationStatus;
  onUpdated: (s: VerificationSummary) => void;
}) {
  const theme = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [errors, setErrors] = useState<{ title?: string; file?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick() {
    setErrors((e) => ({ ...e, file: undefined }));
    const result = await DocumentPicker.getDocumentAsync({
      type: UPLOAD_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    if (asset.size && asset.size > MAX_UPLOAD_BYTES) {
      setErrors((e) => ({ ...e, file: 'That file is over 8MB. Try a smaller scan or photo.' }));
      return;
    }
    setFile({ uri: asset.uri, name: asset.name, size: asset.size });
  }

  async function upload() {
    setError(null);
    const next: typeof errors = {};
    if (!title.trim()) next.title = 'Add a title, e.g. Cert III in Hairdressing';
    if (!file) next.file = 'Choose a PDF, JPG or PNG';
    setErrors(next);
    if (next.title || next.file || !file) return;

    setBusy(true);
    try {
      const blob = new File(file.uri);
      const summary = await api.uploadQualification({ blob, name: file.name }, title.trim());
      setTitle('');
      setFile(null);
      setShowForm(false);
      onUpdated(summary);
      Alert.alert('Uploaded', 'Thanks! We’ll review your qualification shortly.');
    } catch (err) {
      if (err instanceof ApiClientError && err.fieldErrors) {
        setErrors({ title: err.fieldErrors.title?.[0], file: err.fieldErrors.file?.[0] });
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const formVisible = canSubmit(status) || showForm;

  return (
    <VerificationStep
      step={3}
      icon="qualification"
      title="Qualification"
      status={status}
      description={
        status === 'verified'
          ? 'Your qualification is verified. Some salons require this to apply.'
          : status === 'pending'
            ? 'We’re reviewing your certificate.'
            : 'Upload your certificate (PDF, JPG or PNG, up to 8MB). Some jobs require a verified qualification.'
      }>
      {formVisible ? (
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
          <View
            style={[
              styles.file,
              { borderColor: errors.file ? theme.danger : theme.border, backgroundColor: theme.surfaceMuted },
            ]}>
            <Icon name="upload" size={20} color={theme.textSecondary} />
            <View style={styles.flex}>
              <Text variant="smallStrong" numberOfLines={1}>
                {file ? file.name : 'No file chosen'}
              </Text>
              <Text variant="caption" color={errors.file ? 'danger' : 'textMuted'}>
                {errors.file ??
                  (file?.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'PDF, JPG or PNG')}
              </Text>
            </View>
            <Button title={file ? 'Change' : 'Choose'} size="sm" variant="outline" onPress={pick} />
          </View>
          <ErrorBanner message={error} />
          <Button title="Upload" onPress={upload} loading={busy} variant="secondary" />
        </View>
      ) : status === 'verified' ? (
        <Button title="Upload another" variant="ghost" size="sm" onPress={() => setShowForm(true)} />
      ) : null}
    </VerificationStep>
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
