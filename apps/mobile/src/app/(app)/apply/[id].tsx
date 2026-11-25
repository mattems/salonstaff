import { applySchema } from '@salonstaff/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ErrorBanner } from '@/components/state-views';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { VerificationBadge } from '@/components/verification-badge';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiClientError, api, errorMessage } from '@/lib/api';
import { useUser } from '@/lib/auth';

const MAX_NOTE = 1500;

export default function ApplyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useUser();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const [coverNote, setCoverNote] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    setFieldError(null);
    const parsed = applySchema.safeParse({ coverNote });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Check your cover note');
      return;
    }
    setSubmitting(true);
    try {
      await api.apply(id, parsed.data);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiClientError && err.fieldErrors?.coverNote?.length) {
        setFieldError(err.fieldErrors.coverNote[0]);
      }
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <View style={[styles.done, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Application sent' }} />
        <View style={[styles.doneIcon, { backgroundColor: theme.successSoft }]}>
          <Icon name="done" size={36} color={theme.success} />
        </View>
        <Text variant="title" style={styles.center}>
          Application sent
        </Text>
        <Text color="textSecondary" style={styles.center}>
          The salon will see your verified profile. Track progress in the Applications tab.
        </Text>
        <Button title="Done" onPress={() => router.back()} style={styles.stretch} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text variant="overline" color="brand">
            Applying for
          </Text>
          <Text variant="heading">{title ?? 'This job'}</Text>
        </View>

        <View style={styles.sharing}>
          <Text variant="small" color="textSecondary">
            The salon will see your profile and verification level:
          </Text>
          <VerificationBadge level={user.verification.level} compact />
        </View>

        <TextField
          label="Cover note (optional)"
          value={coverNote}
          onChangeText={setCoverNote}
          placeholder="Say hello, share your specialties, availability or a link to your work."
          multiline
          maxLength={MAX_NOTE}
          error={fieldError}
          hint={`${coverNote.length}/${MAX_NOTE}`}
        />

        <ErrorBanner message={error} />

        <Button title="Send application" onPress={submit} loading={submitting} />
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} disabled={submitting} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.five, gap: Spacing.four },
  header: { gap: Spacing.one },
  sharing: { gap: Spacing.two },
  done: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.six,
    gap: Spacing.three,
  },
  doneIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch', marginTop: Spacing.four },
});
