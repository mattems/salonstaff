import { BRAND, emailChangeSchema, mobileChangeSchema } from '@salonstaff/shared';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ErrorBanner, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiProblem,
  api,
  errorMessage,
  type OAuthProvider,
  type SignInMethods,
  type SignInSession,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatAuMobile, formatDate } from '@/lib/format';
import { isAppleAvailable, isGoogleConfigured, signInWithApple, signInWithGoogle } from '@/lib/social-auth';

/** Sign-in and security (D-12): the account's email and mobile, Google and Apple, and devices. */
export default function SecurityScreen() {
  const { refresh: refreshMe } = useAuth();
  const { data, error, loading, refreshing, reload, refresh } = useRequest(
    async () => {
      const [methods, sessions] = await Promise.all([api.signInMethods(), api.sessions()]);
      return { methods, sessions: sessions.items };
    },
    { refetchOnFocus: true },
  );
  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;

  const changed = async () => {
    await Promise.all([reload(), refreshMe()]);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <CodeChange kind="email" current={data.methods.email} onChanged={changed} />
      <CodeChange kind="mobile" current={data.methods.phoneNumber} onChanged={changed} />
      <Providers methods={data.methods} onChange={reload} />
      <Sessions sessions={data.sessions} onChange={reload} />
    </Screen>
  );
}

// ---------- Email and mobile ----------

const COPY = {
  email: {
    title: 'Email',
    label: (has: boolean) => (has ? 'New email' : 'Email'),
    none: 'Your account has no email yet. Add one to sign in with an email code and get notices by email.',
    current: (value: string) => `Sign-in codes and notices go to ${value}.`,
    sent: 'It lasts 10 minutes. If it doesn’t arrive, check the address: we can’t send one to an address that’s already on another account.',
    done: (has: boolean) => (has ? 'Email changed' : 'Email added'),
  },
  mobile: {
    title: 'Mobile',
    label: (has: boolean) => (has ? 'New mobile' : 'Mobile'),
    none: 'Your account has no mobile yet. Add one to sign in with an SMS code, and so salons can call you if you let them.',
    current: (value: string) => `Sign-in codes by SMS go to ${formatAuMobile(value)}. It’s the number salons see if you let them.`,
    sent: 'It lasts 10 minutes. Australian mobiles only.',
    done: (has: boolean) => (has ? 'Mobile changed' : 'Mobile added'),
  },
} as const;

function CodeChange({
  kind,
  current,
  onChanged,
}: {
  kind: 'email' | 'mobile';
  current: string | null;
  onChanged: () => Promise<void>;
}) {
  const copy = COPY[kind];
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(to?: string) {
    setProblem(null);
    setNotice(null);
    let target = to;
    if (!target) {
      const parsed =
        kind === 'email'
          ? emailChangeSchema.safeParse({ email: value })
          : mobileChangeSchema.safeParse({ phoneNumber: value });
      if (!parsed.success) {
        setFieldError(parsed.error.issues[0]?.message ?? 'Check this');
        return;
      }
      target = 'email' in parsed.data ? parsed.data.email : parsed.data.phoneNumber;
    }
    setFieldError(null);
    setBusy(true);
    try {
      if (kind === 'email') await api.changeEmail(target);
      else await api.changeMobile(target);
      setSentTo(target);
      setCode('');
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!sentTo) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setFieldError('Enter the 6-digit code');
      return;
    }
    setFieldError(null);
    setProblem(null);
    setBusy(true);
    try {
      if (kind === 'email') await api.confirmEmail(sentTo, code.trim());
      else await api.confirmMobile(sentTo, code.trim());
      setSentTo(null);
      setValue('');
      setNotice(copy.done(!!current));
      await onChanged();
    } catch (err) {
      if (err instanceof ApiProblem && err.field('code')) setFieldError(err.field('code') ?? null);
      else setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text variant="subheading">{copy.title}</Text>
      <Text variant="small" color="textSecondary">
        {current ? copy.current(current) : copy.none}
      </Text>
      {sentTo === null ? (
        <>
          <TextField
            label={copy.label(!!current)}
            value={value}
            onChangeText={(v) => {
              setValue(v);
              setFieldError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={kind === 'email' ? 'email-address' : 'phone-pad'}
            placeholder={kind === 'email' ? 'you@example.com' : '0412 345 678'}
            hint="We’ll send a code to it to make sure it’s yours."
            error={fieldError}
          />
          <ErrorBanner message={problem} />
          {notice ? (
            <Text variant="small" color="success">
              {notice}
            </Text>
          ) : null}
          <Button title="Send a code" variant="secondary" loading={busy} onPress={() => send()} />
        </>
      ) : (
        <>
          <Text variant="small">
            We sent a 6-digit code to{' '}
            <Text variant="smallStrong">{kind === 'mobile' ? formatAuMobile(sentTo) : sentTo}</Text>.{' '}
            {copy.sent}
          </Text>
          <TextField
            label="Code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            error={fieldError}
          />
          <ErrorBanner message={problem} />
          <Button title={kind === 'email' ? (current ? 'Change email' : 'Add email') : current ? 'Change mobile' : 'Add mobile'} loading={busy} onPress={confirm} />
          <View style={styles.row}>
            <Button title="Send a new code" variant="ghost" size="sm" disabled={busy} onPress={() => send(sentTo)} />
            <Button
              title={kind === 'email' ? 'Different email' : 'Different number'}
              variant="ghost"
              size="sm"
              disabled={busy}
              onPress={() => setSentTo(null)}
            />
          </View>
        </>
      )}
    </Card>
  );
}

// ---------- Google and Apple ----------

function Providers({ methods, onChange }: { methods: SignInMethods; onChange: () => Promise<void> }) {
  const theme = useTheme();
  const [pending, setPending] = useState<string | null>(null);
  const [appleHere, setAppleHere] = useState(false);
  useEffect(() => {
    let alive = true;
    isAppleAvailable().then((ok) => alive && setAppleHere(ok));
    return () => {
      alive = false;
    };
  }, []);

  /** This build can get an ID token from the provider. */
  const canConnectHere = (provider: OAuthProvider) =>
    provider === 'apple' ? appleHere : isGoogleConfigured();

  async function connect(provider: OAuthProvider) {
    setPending(provider);
    try {
      const credential = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
      if (!credential) return;
      await api.connectProvider(provider, credential.idToken);
      await onChange();
    } catch (err) {
      const message = errorMessage(err);
      Alert.alert(
        'Couldn’t connect it',
        /already/i.test(message)
          ? `That account is already connected to a different ${BRAND.name} account. Sign in with it there and disconnect it first.`
          : message,
      );
    } finally {
      setPending(null);
    }
  }

  async function disconnect(provider: OAuthProvider, label: string) {
    setPending(provider);
    try {
      await api.disconnectProvider(provider);
      await onChange();
    } catch (err) {
      Alert.alert(`Couldn’t disconnect ${label}`, errorMessage(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <Text variant="subheading">Other ways you sign in</Text>
      <Text variant="small" color="textSecondary">
        Connect Google or Apple to sign in with one tap. Its email doesn’t have to match.
      </Text>
      {methods.providers.map((item) => (
        <View key={item.provider} style={[styles.item, { borderColor: theme.border }]}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">{item.label}</Text>
            <Text variant="small" color="textSecondary">
              {item.connected
                ? `Connected ${item.connectedAt ? formatDate(item.connectedAt) : ''}`
                : !item.available
                  ? 'Not available yet'
                  : canConnectHere(item.provider)
                    ? 'Not connected'
                    : 'Not connected. Connect it on the website.'}
            </Text>
          </View>
          {item.connected ? (
            <Button
              title="Disconnect"
              size="sm"
              variant="outline"
              disabled={pending !== null}
              onPress={() => disconnect(item.provider, item.label)}
            />
          ) : item.available && canConnectHere(item.provider) ? (
            <Button
              title="Connect"
              size="sm"
              variant="outline"
              loading={pending === item.provider}
              disabled={pending !== null}
              onPress={() => connect(item.provider)}
            />
          ) : null}
        </View>
      ))}
    </Card>
  );
}

// ---------- Devices ----------

function Sessions({ sessions, onChange }: { sessions: SignInSession[]; onChange: () => Promise<void> }) {
  const theme = useTheme();
  const [pending, setPending] = useState<string | null>(null);
  const others = sessions.filter((s) => !s.current).length;

  async function run(key: string, work: () => Promise<unknown>) {
    setPending(key);
    try {
      await work();
      await onChange();
    } catch (err) {
      Alert.alert('Couldn’t sign it out', errorMessage(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <Text variant="subheading">Where you’re signed in</Text>
      {sessions.map((session) => (
        <View key={session.id} style={[styles.item, { borderColor: theme.border }]}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">
              {session.device}
              {session.current ? ' (this device)' : ''}
            </Text>
            <Text variant="small" color="textSecondary">
              Signed in {formatDate(session.signedInAt)} · last used {formatDate(session.lastActiveAt)}
            </Text>
          </View>
          {session.current ? null : (
            <Button
              title="Sign out"
              size="sm"
              variant="outline"
              loading={pending === session.id}
              disabled={pending !== null}
              onPress={() => run(session.id, () => api.signOutSession(session.id))}
            />
          )}
        </View>
      ))}
      {others > 0 ? (
        <Button
          title="Sign out everywhere else"
          variant="ghost"
          size="sm"
          loading={pending === 'others'}
          disabled={pending !== null}
          onPress={() => run('others', api.signOutOthers)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
