import { NOTIFICATION_TOPICS, type NotificationTopic } from '@salonstaff/shared';
import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Share, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { RadioList } from '@/components/radio-list';
import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage, type NotificationPreferences } from '@/lib/api';
import {
  APPEARANCE_CHOICES,
  type AppearanceChoice,
  savedAppearance,
  setAppearance,
} from '@/lib/appearance';
import { useUser } from '@/lib/auth';
import { API_URL, SITE_URL } from '@/lib/config';
import { useBiometricLock } from '@/lib/biometric-lock';
import { useMode } from '@/lib/mode';
import { pushAvailable, registerForPush } from '@/lib/push-notifications';

/**
 * Notifications, Face ID, light or dark, and which version this is (plus debug details in
 * development).
 */
export default function SettingsScreen() {
  const push = usePushPermission();
  return (
    <Screen>
      <PushWarning {...push} />
      <NotificationsCard permission={push.permission} />
      <LockCard />
      <AppearanceCard />
      <AboutCard />
      {__DEV__ ? <DeveloperCard /> : null}
    </Screen>
  );
}

// ---------- Notifications ----------

type Permission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** Whether this phone lets the app show notifications, re-read whenever the screen is opened. */
function usePushPermission() {
  const [permission, setPermission] = useState<Permission>(
    pushAvailable ? 'undetermined' : 'unavailable',
  );
  const check = useCallback(async () => {
    if (!pushAvailable) return;
    const result = await Notifications.getPermissionsAsync();
    setPermission(result.granted ? 'granted' : result.canAskAgain ? 'undetermined' : 'denied');
  }, []);
  useFocusEffect(
    useCallback(() => {
      void check();
    }, [check]),
  );
  return { permission, check };
}

/**
 * Above the notification settings when this phone won't show the app's pushes: turned off in iOS
 * Settings (open them), or never asked (ask now). Without it the push switches do nothing.
 */
function PushWarning({ permission, check }: ReturnType<typeof usePushPermission>) {
  const theme = useTheme();
  const { mode } = useMode();
  if (permission !== 'denied' && permission !== 'undetermined') return null;

  async function turnOn() {
    try {
      await registerForPush();
    } finally {
      await check();
    }
  }

  return (
    <View
      accessibilityRole="alert"
      style={[styles.warning, { backgroundColor: theme.warningSoft }]}>
      <View style={styles.warningHead}>
        <Icon name="bell" size={18} color={theme.warning} />
        <Text variant="bodyStrong" style={[styles.flex, { color: theme.warning }]}>
          Notifications are off
        </Text>
      </View>
      <Text variant="small" color="textSecondary">
        {permission === 'denied'
          ? 'Salon Staff can’t send you pushes: they’re turned off for it in your iPhone’s Settings.'
          : mode === 'salon'
            ? 'Turn them on to hear the moment someone applies or writes back to your salon.'
            : 'Turn them on to hear the moment a salon writes to you or moves your application along.'}
      </Text>
      {permission === 'denied' ? (
        <Button title="Open iPhone Settings" size="sm" onPress={() => Linking.openSettings()} />
      ) : (
        <Button title="Turn on notifications" size="sm" icon="bell" onPress={turnOn} />
      )}
    </View>
  );
}

/** The topics of the side of the app that's showing (D-20): a job seeker's, or a salon team's. */
function NotificationsCard({ permission }: { permission: Permission }) {
  const theme = useTheme();
  const { mode } = useMode();
  const topics = NOTIFICATION_TOPICS.filter((topic) => topic.side === mode);
  const { data, error, loading, reload, setData } = useRequest(api.notificationPreferences);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  // An account made with a mobile has no email: nothing for the email switches to send to (D-24).
  const hasEmail = !!useUser().email;

  async function change(topic: NotificationTopic, channel: 'push' | 'email', on: boolean) {
    if (!data) return;
    const before = data;
    const next: NotificationPreferences = { ...data, [topic]: { ...data[topic], [channel]: on } };
    setData(() => next);
    setSaving(true);
    try {
      const saved = await api.saveNotificationPreferences(next);
      setData(() => saved);
    } catch (err) {
      setData(() => before);
      Alert.alert('Couldn’t save that', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Text variant="subheading">Notifications</Text>
      {permission === 'unavailable' ? (
        <Text variant="small" color="textSecondary">
          Pushes need the installed app: Expo Go can’t receive them. Emails still come.
        </Text>
      ) : null}

      {loading && !data ? (
        <LoadingView />
      ) : error && !data ? (
        <ErrorView message={error} onRetry={reload} />
      ) : data ? (
        topics.map((topic) => (
          <View key={topic.value} style={[styles.topic, { borderColor: theme.border }]}>
            <Text variant="bodyStrong">{topic.label}</Text>
            <Text variant="small" color="textSecondary">
              {topic.description}
            </Text>
            <Toggle
              label="Push"
              value={data[topic.value].push}
              disabled={saving}
              onChange={(on) => change(topic.value, 'push', on)}
            />
            <Toggle
              label="Email"
              value={hasEmail && data[topic.value].email}
              disabled={saving || !hasEmail}
              onChange={(on) => change(topic.value, 'email', on)}
            />
          </View>
        ))
      ) : null}
      {data && !hasEmail ? (
        <View style={styles.notice}>
          <Text variant="small" color="textSecondary">
            There’s no email on your account, so these come by push only. Add one to get them by
            email too.
          </Text>
          <Button
            title="Add an email"
            size="sm"
            variant="outline"
            onPress={() => router.push('/profile/security')}
          />
        </View>
      ) : null}
      <Text variant="caption" color="textMuted">
        {mode === 'salon'
          ? 'Notices about a salon itself (its team, a claim), sign-in codes and security emails always come. New applicants come only for jobs that tell you about applications, as chosen on the website.'
          : 'Sign-in codes and security emails always come.'}
      </Text>
    </Card>
  );
}

function Toggle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.toggle}>
      <Text style={styles.flex}>{label}</Text>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: theme.brand, false: theme.border }}
        thumbColor={Platform.OS === 'android' ? theme.surface : undefined}
      />
    </View>
  );
}

// ---------- Face ID (D-21) ----------

function LockCard() {
  const { kind, enabled, setEnabled } = useBiometricLock();
  const [busy, setBusy] = useState(false);
  if (!kind) return null;
  async function change(on: boolean) {
    setBusy(true);
    try {
      await setEnabled(on);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Text variant="subheading">{kind}</Text>
      <Toggle label={`Ask for ${kind} to open the app`} value={enabled} disabled={busy} onChange={change} />
      <Text variant="caption" color="textMuted">
        You stay signed in on this phone, and the app asks for {kind} (or your passcode) when you open it,
        and when you come back after five minutes away.
      </Text>
    </Card>
  );
}

// ---------- Appearance ----------

function AppearanceCard() {
  const [choice, setChoice] = useState<AppearanceChoice | null>(null);
  useEffect(() => {
    void savedAppearance().then(setChoice);
  }, []);
  if (!choice) return null;
  return (
    <View style={styles.section}>
      <Text variant="subheading">Appearance</Text>
      <RadioList
        options={APPEARANCE_CHOICES}
        value={choice}
        onChange={(next) => {
          setChoice(next);
          void setAppearance(next);
        }}
      />
    </View>
  );
}

// ---------- About ----------

const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '?';
const build = Application.nativeBuildVersion;

function AboutCard() {
  return (
    <Card>
      <Text variant="subheading">About</Text>
      <Detail label="Version" value={build ? `${version} (${build})` : version} />
    </Card>
  );
}

// ---------- Development only ----------

function buildKind() {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'Expo Go';
  return __DEV__ ? 'Development build' : 'Release';
}

function DeveloperCard() {
  const user = useUser();
  const { permission } = usePushPermission();
  const details: [string, string][] = [
    ['Build', buildKind()],
    ['API', API_URL],
    ['Website', SITE_URL],
    ['Bundle ID', Application.applicationId ?? '?'],
    ['Expo SDK', Constants.expoConfig?.sdkVersion ?? '?'],
    [
      'Device',
      `${Device.modelName ?? 'Unknown'} · ${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`,
    ],
    ['Push permission', permission],
    ['User', `${user.id} (${user.role})`],
  ];
  const text = details.map(([label, value]) => `${label}: ${value}`).join('\n');
  return (
    <Card>
      <Text variant="subheading">Developer</Text>
      <Text variant="caption" color="textMuted">
        Only in development builds.
      </Text>
      {details.map(([label, value]) => (
        <Detail key={label} label={label} value={value} />
      ))}
      <Button
        title="Share these details"
        size="sm"
        variant="outline"
        onPress={() => Share.share({ message: `Salon Staff ${version}\n${text}` })}
      />
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text variant="small" color="textSecondary">
        {label}
      </Text>
      <Text variant="small" selectable style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  warning: { gap: Spacing.two, padding: Spacing.four, borderRadius: 16 },
  warningHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  section: { gap: Spacing.two },
  notice: { gap: Spacing.two },
  topic: {
    gap: Spacing.one,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.one },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
  value: { flexShrink: 1, textAlign: 'right' },
});
