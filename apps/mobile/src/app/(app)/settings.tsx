import { NOTIFICATION_TOPICS, type NotificationTopic } from '@salonstaff/shared';
import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Share, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
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
import { pushAvailable, registerForPush } from '@/lib/push-notifications';

/** Notifications, light or dark, and which version this is (plus debug details in development). */
export default function SettingsScreen() {
  return (
    <Screen>
      <NotificationsCard />
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

function NotificationsCard() {
  const theme = useTheme();
  const { data, error, loading, reload, setData } = useRequest(api.notificationPreferences);
  const { permission, check } = usePushPermission();
  const [saving, setSaving] = useState(false);

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

  async function turnOn() {
    try {
      await registerForPush();
    } finally {
      await check();
    }
  }

  return (
    <Card>
      <Text variant="subheading">Notifications</Text>
      {permission === 'denied' ? (
        <View style={styles.notice}>
          <Text variant="small" color="textSecondary">
            Notifications are turned off for Salon Staff on this phone, so pushes can’t show.
          </Text>
          <Button
            title="Open iPhone Settings"
            size="sm"
            variant="outline"
            onPress={() => Linking.openSettings()}
          />
        </View>
      ) : permission === 'undetermined' ? (
        <View style={styles.notice}>
          <Text variant="small" color="textSecondary">
            Get a push the moment a salon writes to you.
          </Text>
          <Button title="Turn on notifications" size="sm" variant="outline" onPress={turnOn} />
        </View>
      ) : permission === 'unavailable' ? (
        <Text variant="small" color="textSecondary">
          Pushes need the installed app: Expo Go can’t receive them. Emails still come.
        </Text>
      ) : null}

      {loading && !data ? (
        <LoadingView />
      ) : error && !data ? (
        <ErrorView message={error} onRetry={reload} />
      ) : data ? (
        NOTIFICATION_TOPICS.map((topic) => (
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
              value={data[topic.value].email}
              disabled={saving}
              onChange={(on) => change(topic.value, 'email', on)}
            />
          </View>
        ))
      ) : null}
      <Text variant="caption" color="textMuted">
        Sign-in codes and security emails always come. Email means a text if your account has no
        email.
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
