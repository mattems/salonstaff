import { requestCodeSchema } from '@salonstaff/shared';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { PhoneField } from '@/components/phone-field';
import { SocialButton } from '@/components/social-button';
import { ErrorBanner } from '@/components/state-views';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';
import { errorMessage, type OAuthProvider } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { siteUrl } from '@/lib/config';
import {
  isAppleAvailable,
  isGoogleConfigured,
  ProviderUnavailableError,
  signInWithApple,
  signInWithGoogle,
} from '@/lib/social-auth';

/**
 * Signing up and signing in (D-24), both by a code texted to an Australian mobile: the number is
 * the whole screen. "I'm looking for work" opens it to sign up; "Sign in" opens it to sign in, where
 * email, Apple and Google are under "Other ways to sign in" for accounts that already use them.
 * The code screen is the same for both: an existing number signs in, a new one gets an account.
 */
export default function SignInScreen() {
  const theme = useTheme();
  const dark = useIsDark();
  const router = useRouter();
  const { sendCode, signInWithOAuth, devLogin } = useAuth();
  const { intent } = useLocalSearchParams<{ intent?: 'signup' | 'signin' }>();
  const signingUp = intent === 'signup';

  const [digits, setDigits] = useState('');
  const [email, setEmail] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<'phone' | 'email' | null>(null);
  const [busyProvider, setBusyProvider] = useState<OAuthProvider | 'dev' | 'dev-salon' | null>(
    null,
  );
  const [otherWays, setOtherWays] = useState(false);
  const [appleNative, setAppleNative] = useState(false);

  useEffect(() => {
    let alive = true;
    void isAppleAvailable().then((ok) => {
      if (alive) setAppleNative(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Only offer providers this build can actually use.
  const showApple = appleNative;
  const showGoogle = isGoogleConfigured();

  async function textCode() {
    setError(null);
    const parsed = requestCodeSchema.safeParse({ phone: `+61${digits}`, role: 'seeker' });
    const phone = parsed.success ? parsed.data.phone : undefined;
    if (!phone) {
      setPhoneError('Enter your Australian mobile number, like 412 345 678');
      return;
    }
    setPhoneError(null);
    setSending('phone');
    try {
      await sendCode({ phone });
      router.push({ pathname: '/verify-code', params: { phone } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(null);
    }
  }

  async function emailCode() {
    setError(null);
    // The keyboard often leaves a space at the end; the shared rule checks before it trims.
    const parsed = requestCodeSchema.safeParse({ email: email.trim(), role: 'seeker' });
    const address = parsed.success ? parsed.data.email : undefined;
    if (!address) {
      setEmailError('Enter a valid email');
      return;
    }
    setEmailError(null);
    setSending('email');
    try {
      await sendCode({ email: address });
      router.push({ pathname: '/verify-code', params: { email: address } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(null);
    }
  }

  async function withProvider(provider: OAuthProvider) {
    setError(null);
    setBusyProvider(provider);
    try {
      const credential = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
      // On success the auth guard swaps to the signed-in app.
      if (credential) await signInWithOAuth(provider, credential.idToken, credential.name);
    } catch (err) {
      setError(err instanceof ProviderUnavailableError ? err.message : errorMessage(err));
    } finally {
      setBusyProvider(null);
    }
  }

  async function onDevLogin(role: 'seeker' | 'employer') {
    setError(null);
    setBusyProvider(role === 'employer' ? 'dev-salon' : 'dev');
    try {
      await devLogin(role);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyProvider(null);
    }
  }

  function switchTo(next: 'signup' | 'signin') {
    setError(null);
    setPhoneError(null);
    setOtherWays(false);
    router.setParams({ intent: next });
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <Text variant="title" accessibilityRole="header">
              {signingUp ? 'What’s your mobile number?' : 'Welcome back'}
            </Text>
            <Text color="textSecondary">
              {signingUp
                ? 'We’ll text you a code to set up your account. No password needed.'
                : 'Sign in with your mobile number. We’ll text you a code.'}
            </Text>
          </View>

          <PhoneField
            digits={digits}
            onChangeDigits={(d) => {
              setDigits(d);
              if (phoneError) setPhoneError(null);
            }}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={textCode}
            error={phoneError}
            hint="Australian mobiles only. Standard SMS rates may apply."
          />
          <ErrorBanner message={error} />
          <Button title="Text me a code" onPress={textCode} loading={sending === 'phone'} />

          {signingUp ? (
            <View style={styles.footer}>
              <Text variant="small" color="textSecondary" style={styles.center}>
                Already have an account?{' '}
                <Text variant="smallStrong" color="brand" onPress={() => switchTo('signin')}>
                  Sign in
                </Text>
              </Text>
              <Text variant="caption" color="textMuted" style={styles.center}>
                How we look after your details:{' '}
                <Text
                  variant="caption"
                  color="brand"
                  onPress={() => void WebBrowser.openBrowserAsync(siteUrl('/privacy'))}>
                  Privacy policy
                </Text>
              </Text>
            </View>
          ) : (
            <View style={styles.footer}>
              <Pressable
                onPress={() => {
                  // Out of the way, so the other ways show.
                  Keyboard.dismiss();
                  LayoutAnimation.easeInEaseOut();
                  setOtherWays((on) => !on);
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: otherWays }}
                style={styles.otherToggle}>
                <Text variant="smallStrong" color="brand">
                  Other ways to sign in
                </Text>
                <Icon
                  name="chevronDown"
                  size={12}
                  color={theme.brand}
                  style={otherWays ? styles.flipped : undefined}
                />
              </Pressable>

              {otherWays ? (
                <View style={styles.other}>
                  {showApple ? (
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                      buttonStyle={
                        dark
                          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      }
                      cornerRadius={25}
                      style={styles.appleButton}
                      onPress={() => void withProvider('apple')}
                    />
                  ) : null}
                  {showGoogle ? (
                    <SocialButton
                      provider="google"
                      label="Sign in with Google"
                      onPress={() => void withProvider('google')}
                      loading={busyProvider === 'google'}
                      disabled={busyProvider === 'apple'}
                    />
                  ) : null}
                  <TextField
                    label="Email"
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      if (emailError) setEmailError(null);
                    }}
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType="go"
                    onSubmitEditing={emailCode}
                    error={emailError}
                  />
                  <Button
                    title="Email me a code"
                    variant="outline"
                    onPress={emailCode}
                    loading={sending === 'email'}
                  />
                </View>
              ) : null}

              <Text variant="small" color="textSecondary" style={styles.center}>
                New to Salon Staff?{' '}
                <Text variant="smallStrong" color="brand" onPress={() => switchTo('signup')}>
                  Create an account
                </Text>
              </Text>
            </View>
          )}

          {__DEV__ ? (
            <View style={[styles.dev, { borderColor: theme.border }]}>
              <Text variant="caption" color="textMuted">
                Development only: works against a local API.
              </Text>
              <Button
                title="Demo job seeker"
                variant="outline"
                size="sm"
                loading={busyProvider === 'dev'}
                onPress={() => onDevLogin('seeker')}
              />
              <Button
                title="Demo salon owner"
                variant="outline"
                size="sm"
                loading={busyProvider === 'dev-salon'}
                onPress={() => onDevLogin('employer')}
              />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Room at the top for the Back button (it's reached from the welcome screen).
  content: { flexGrow: 1, padding: Spacing.five, paddingTop: Spacing.five + 56, gap: Spacing.four },
  intro: { gap: Spacing.two, marginBottom: Spacing.two },
  footer: { gap: Spacing.four, marginTop: Spacing.three },
  center: { textAlign: 'center' },
  otherToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
  },
  flipped: { transform: [{ rotate: '180deg' }] },
  other: { gap: Spacing.three },
  appleButton: { height: 50, width: '100%' },
  dev: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: Spacing.four,
  },
});
