/**
 * Face ID (or Touch ID, or a fingerprint) to open the app (D-21). Once someone has signed in with a
 * code, the app keeps their session; with this turned on, opening the app, or coming back to it after
 * a while away, asks for their face or finger first, falling back to the phone's passcode, before
 * anything shows. It's a lock on this phone over the saved session: nothing changes on the server, and
 * signing in on a new phone is still by code. The choice is kept on the phone and forgotten on sign out.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { tokenStore } from '@/lib/token-store';

const ENABLED_KEY = 'salonstaff.biometric-lock';
/** Asked once after signing in with a code, so it isn't asked again until the next sign-in. */
const OFFERED_KEY = 'salonstaff.biometric-lock-offered';
/** Away longer than this and the app locks again. */
export const LOCK_AFTER_MS = 5 * 60 * 1000;

/** What this phone calls it, or null when it has none set up. */
export type BiometricKind = 'Face ID' | 'Touch ID' | 'fingerprint' | 'face unlock' | null;

export async function biometricKind(): Promise<BiometricKind> {
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) return null;
    if (!(await LocalAuthentication.isEnrolledAsync())) return null;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    if (Platform.OS === 'ios') return face ? 'Face ID' : 'Touch ID';
    return types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
      ? 'fingerprint'
      : face
        ? 'face unlock'
        : null;
  } catch {
    return null;
  }
}

/** Asks for their face or finger (or the phone's passcode). True when it's them. */
export async function confirmIdentity(promptMessage: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use passcode',
  });
  return result.success;
}

type LockContextValue = {
  /** Face ID, Touch ID… on this phone, or null when it has none set up. */
  kind: BiometricKind;
  enabled: boolean;
  /** Turns it on (after asking for their face or finger) or off. False if they didn't confirm. */
  setEnabled: (on: boolean) => Promise<boolean>;
};

const LockContext = createContext<LockContextValue | null>(null);

export function useBiometricLock(): LockContextValue {
  const value = use(LockContext);
  if (!value) throw new Error('useBiometricLock must be used inside <BiometricLockProvider>');
  return value;
}

export function BiometricLockProvider({ children }: PropsWithChildren) {
  const { status } = useAuth();
  const [kind, setKind] = useState<BiometricKind>(null);
  const [enabled, setEnabledState] = useState<boolean | undefined>(undefined);
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const lastStatus = useRef(status);

  useEffect(() => {
    void Promise.all([biometricKind(), tokenStore.get(ENABLED_KEY).catch(() => null)]).then(
      ([found, saved]) => {
        setKind(found);
        const on = saved === 'on' && found !== null;
        setEnabledState(on);
        // Opening the app with a saved session: locked until it's them.
        if (on) setLocked(true);
      },
    );
  }, []);

  const setEnabled = useCallback(
    async (on: boolean) => {
      if (on) {
        if (!kind || !(await confirmIdentity(`Use ${kind} to open Salon Staff`))) return false;
        await tokenStore.set(ENABLED_KEY, 'on').catch(() => {});
      } else {
        await tokenStore.remove(ENABLED_KEY).catch(() => {});
      }
      setEnabledState(on);
      return true;
    },
    [kind],
  );

  // Signing in with a code: offer it once. Signing out: forget it (and offer it again next time).
  useEffect(() => {
    const before = lastStatus.current;
    lastStatus.current = status;
    if (status === 'signedOut' && before !== 'loading') {
      setLocked(false);
      setEnabledState(false);
      void tokenStore.remove(ENABLED_KEY).catch(() => {});
      void tokenStore.remove(OFFERED_KEY).catch(() => {});
      return;
    }
    if (status !== 'signedIn' || before !== 'signedOut' || !kind || enabled) return;
    void tokenStore.get(OFFERED_KEY).then((offered) => {
      if (offered) return;
      void tokenStore.set(OFFERED_KEY, 'yes').catch(() => {});
      Alert.alert(
        `Use ${kind} to open Salon Staff?`,
        `You'll stay signed in, and the app asks for ${kind} each time you open it. You can turn it off in Settings.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: `Use ${kind}`, onPress: () => void setEnabled(true) },
        ],
      );
    });
  }, [status, kind, enabled, setEnabled]);

  // Away for a while: locked again when they come back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') backgroundedAt.current = Date.now();
      if (next === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (enabled && status === 'signedIn' && away > LOCK_AFTER_MS) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [enabled, status]);

  const value = useMemo<LockContextValue>(
    () => ({ kind, enabled: !!enabled, setEnabled }),
    [kind, enabled, setEnabled],
  );

  // Wait for the saved choice, so nothing shows before the lock does.
  if (enabled === undefined) return null;
  return (
    <LockContext value={value}>
      {children}
      {locked && status !== 'signedOut' ? (
        <LockScreen kind={kind} onUnlock={() => setLocked(false)} />
      ) : null}
    </LockContext>
  );
}

/** Over everything (the app stays as it was underneath) until it's them. */
function LockScreen({ kind, onUnlock }: { kind: BiometricKind; onUnlock: () => void }) {
  const theme = useTheme();
  const { signOut } = useAuth();
  const [asking, setAsking] = useState(false);
  const label = kind ?? 'your passcode';

  const done = useRef(onUnlock);
  useEffect(() => {
    done.current = onUnlock;
  });

  const unlock = useCallback(async () => {
    setAsking(true);
    try {
      if (await confirmIdentity('Unlock Salon Staff')) done.current();
    } finally {
      setAsking(false);
    }
  }, []);

  // Ask straight away, once, as soon as the app is in front (the prompt can't show before then).
  const asked = useRef(false);
  useEffect(() => {
    const ask = () => {
      if (asked.current) return;
      asked.current = true;
      void unlock();
    };
    if (AppState.currentState === 'active') {
      ask();
      return;
    }
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') ask();
    });
    return () => sub.remove();
  }, [unlock]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.lock, { backgroundColor: theme.background }]}>
      <View style={[styles.badge, { backgroundColor: theme.brandSoft }]}>
        <Icon name="lock" size={32} color={theme.brand} />
      </View>
      <Text variant="heading" style={styles.center}>
        Salon Staff is locked
      </Text>
      <Text color="textSecondary" style={styles.center}>
        Use {label} to open it.
      </Text>
      <Button
        title={`Unlock with ${kind ?? 'passcode'}`}
        loading={asking}
        onPress={unlock}
        style={styles.button}
      />
      <Button
        title="Sign in another way"
        variant="ghost"
        onPress={() =>
          Alert.alert(
            'Sign in another way?',
            'You’ll be signed out on this phone, then you can sign in with a code.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
            ],
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  lock: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.six,
    gap: Spacing.three,
    zIndex: 1000,
  },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: Spacing.four },
});
