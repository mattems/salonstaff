import { requestCodeSchema } from '@salonstaff/shared';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DevOAuthSheet } from '@/components/dev-oauth-sheet';
import { Icon } from '@/components/icon';
import { SegmentedControl } from '@/components/segmented-control';
import { SocialButton } from '@/components/social-button';
import { ErrorBanner } from '@/components/state-views';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';
import { errorMessage, type OAuthProvider } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  isAppleAvailable,
  isGoogleConfigured,
  ProviderUnavailableError,
  signInWithApple,
  signInWithGoogle,
} from '@/lib/social-auth';

type Mode = 'email' | 'phone';

const MODES = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Mobile' },
] as const;

export default function SignInScreen() {
  const theme = useTheme();
  const dark = useIsDark();
  const router = useRouter();
  const { requestCode, signInWithOAuth } = useAuth();

  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyProvider, setBusyProvider] = useState<OAuthProvider | null>(null);
  const [mockProvider, setMockProvider] = useState<OAuthProvider | null>(null);
  const [appleNative, setAppleNative] = useState(false);

  useEffect(() => {
    let alive = true;
    isAppleAvailable().then((ok) => {
      if (alive) setAppleNative(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const googleNative = isGoogleConfigured();
  // In production, only offer providers this build can actually use. In dev, unconfigured
  // providers fall back to a mock token the dev server accepts.
  const showApple = appleNative || __DEV__;
  const showGoogle = googleNative || __DEV__;

  async function finishOAuth(provider: OAuthProvider, idToken: string, name?: string) {
    setError(null);
    try {
      // On success the auth guard swaps to the signed-in app.
      await signInWithOAuth(provider, idToken, name);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onApple() {
    if (!appleNative) {
      setMockProvider('apple');
      return;
    }
    setError(null);
    setBusyProvider('apple');
    try {
      const credential = await signInWithApple();
      if (credential) await finishOAuth('apple', credential.idToken, credential.name);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyProvider(null);
    }
  }

  async function onGoogle() {
    if (!googleNative) {
      setMockProvider('google');
      return;
    }
    setError(null);
    setBusyProvider('google');
    try {
      const credential = await signInWithGoogle();
      if (credential) await finishOAuth('google', credential.idToken, credential.name);
    } catch (err) {
      if (err instanceof ProviderUnavailableError && __DEV__) setMockProvider('google');
      else setError(errorMessage(err));
    } finally {
      setBusyProvider(null);
    }
  }

  async function submitCode() {
    setError(null);
    const parsed = requestCodeSchema.safeParse(
      mode === 'email' ? { email, role: 'seeker' } : { phone, role: 'seeker' },
    );
    const target = parsed.success
      ? mode === 'email'
        ? parsed.data.email
        : parsed.data.phone
      : undefined;
    if (!parsed.success || !target) {
      const fallback = mode === 'email' ? 'Enter a valid email' : 'Enter an Australian mobile number';
      setFieldError(parsed.error?.issues[0]?.message ?? fallback);
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      if (mode === 'email') {
        await requestCode({ email: target });
        router.push({ pathname: '/verify-code', params: { email: target } });
      } else {
        await requestCode({ phone: target });
        router.push({ pathname: '/verify-code', params: { phone: target } });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={[styles.logo, { backgroundColor: theme.brand }]}>
              <Text variant="title" style={{ color: theme.onBrand }}>
                S
              </Text>
            </View>
            <Text variant="overline" color="brand">
              Salon Staff
            </Text>
            <Text variant="display">Hair & beauty jobs for real, verified people.</Text>
            <Text variant="body" color="textSecondary">
              Every job seeker is identity-verified, so salons know they’re hearing from real people —
              not bots.
            </Text>
          </View>

          <View style={styles.providers}>
            {showApple ? (
              appleNative ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={
                    dark
                      ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                      : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={25}
                  style={styles.appleButton}
                  onPress={onApple}
                />
              ) : (
                <SocialButton
                  provider="apple"
                  label="Continue with Apple (dev)"
                  onPress={onApple}
                  loading={busyProvider === 'apple'}
                />
              )
            ) : null}
            {showGoogle ? (
              <SocialButton
                provider="google"
                label={googleNative ? 'Continue with Google' : 'Continue with Google (dev)'}
                onPress={onGoogle}
                loading={busyProvider === 'google'}
                disabled={busyProvider === 'apple'}
              />
            ) : null}
          </View>

          {showApple || showGoogle ? (
            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <Text variant="caption" color="textMuted">
                or get a code
              </Text>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
            </View>
          ) : null}

          <View style={styles.form}>
            <SegmentedControl
              segments={MODES}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setFieldError(null);
              }}
            />
            {mode === 'email' ? (
              <TextField
                key="email"
                label="Email"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (fieldError) setFieldError(null);
                }}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="go"
                onSubmitEditing={submitCode}
                error={fieldError}
              />
            ) : (
              <TextField
                key="phone"
                label="Mobile number"
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  if (fieldError) setFieldError(null);
                }}
                placeholder="0412 345 678"
                autoComplete="tel"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                returnKeyType="go"
                onSubmitEditing={submitCode}
                hint="Australian mobiles only. Standard SMS rates may apply."
                error={fieldError}
              />
            )}
            <ErrorBanner message={error} />
            <Button
              title={mode === 'email' ? 'Email me a code' : 'Text me a code'}
              onPress={submitCode}
              loading={submitting}
            />
          </View>

          <View style={[styles.trust, { backgroundColor: theme.brandSoft }]}>
            <Icon name="shield" size={18} color={theme.brand} />
            <Text variant="small" color="brand" style={styles.flex}>
              No password needed. New here? We’ll create your account as you sign in.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <DevOAuthSheet
        provider={mockProvider}
        onClose={() => setMockProvider(null)}
        onSubmit={async (provider, idToken, name) => {
          await finishOAuth(provider, idToken, name);
          setMockProvider(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.five, gap: Spacing.five, justifyContent: 'center' },
  hero: { gap: Spacing.three },
  logo: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  providers: { gap: Spacing.three },
  appleButton: { height: 50, width: '100%' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  form: { gap: Spacing.four },
  trust: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
});
