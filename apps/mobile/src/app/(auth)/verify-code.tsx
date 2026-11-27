import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ErrorBanner } from '@/components/state-views';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage, type CodeTarget } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatAuMobile } from '@/lib/format';

const RESEND_SECONDS = 30;


export default function VerifyCodeScreen() {
  const theme = useTheme();
  const { email, phone } = useLocalSearchParams<{ email?: string; phone?: string }>();
  const target: CodeTarget = phone ? { phone } : { email: email ?? '' };
  const destination = phone ? formatAuMobile(phone) : (email ?? '');
  const { verifyCode, sendCode } = useAuth();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(value = code) {
    if (!/^\d{6}$/.test(value)) {
      setError('Enter the 6-digit code');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // On success the auth guard swaps to the signed-in app.
      await verifyCode(target, value);
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
      inputRef.current?.focus();
      setSubmitting(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    try {
      await sendCode(target);
      setCooldown(RESEND_SECONDS);
      setNotice('New code sent.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function onChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === 6 && !submitting) void submit(digits);
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="title">{phone ? 'Check your messages' : 'Check your email'}</Text>
            <Text color="textSecondary">
              We sent a 6-digit code {phone ? 'by SMS ' : ''}to{' '}
              <Text variant="bodyStrong">{destination}</Text>. It expires in 10 minutes.
            </Text>
          </View>

          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={onChange}
            autoFocus
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            placeholderTextColor={theme.textMuted}
            selectionColor={theme.brand}
            accessibilityLabel="6-digit code"
            editable={!submitting}
            style={[
              styles.codeInput,
              {
                color: theme.text,
                backgroundColor: theme.surface,
                borderColor: error ? theme.danger : theme.border,
              },
            ]}
          />

          <ErrorBanner message={error} />
          {notice ? (
            <Text variant="small" color="success">
              {notice}
            </Text>
          ) : null}

          <Button title="Verify" onPress={() => submit()} loading={submitting} />
          <Button
            title={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            variant="ghost"
            disabled={cooldown > 0}
            onPress={resend}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.five, paddingTop: Spacing.seven, gap: Spacing.four },
  header: { gap: Spacing.two, marginBottom: Spacing.three },
  codeInput: {
    height: 64,
    borderWidth: 1,
    borderRadius: Radius.md,
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: 12,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
