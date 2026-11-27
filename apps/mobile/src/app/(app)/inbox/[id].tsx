import { APPLICATION_STATUSES, labelFor } from '@salonstaff/shared';
import * as WebBrowser from 'expo-web-browser';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chat } from '@/components/chat';
import { Pill } from '@/components/pill';
import { ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { api, type ConversationThread, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { siteUrl } from '@/lib/config';

/**
 * Your conversation with one salon (D-19): about your applications, or from them finding your
 * profile, with the times they looked at your number. Opening it reads it.
 */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refresh: refreshMe } = useAuth();
  const { data, error, loading, reload, setData } = useRequest(() => api.conversation(id), {
    key: id,
    refetchOnFocus: true,
  });

  // Opening it read the salon's messages: bring the Inbox badge up to date.
  useEffect(() => {
    if (data) void refreshMe();
  }, [data?.id, refreshMe]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <>
      <Stack.Screen options={{ title: data.salon.name }} />
      <Chat
        messages={data.messages}
        setMessages={(update) =>
          setData((prev) => (prev ? { ...prev, messages: update(prev.messages) } : prev))
        }
        livePath={`/v1/me/conversations/${id}/live`}
        onTheirs={() => void reload().then(refreshMe)}
        canSend={data.canSend}
        sendHint={data.sendHint}
        placeholder={`Reply to ${data.salon.name}`}
        emptyText="No messages yet."
        send={(body) => api.sendMessage(id, body)}
        header={<About thread={data} onChange={reload} />}
      />
    </>
  );
}

/** The salon, your applications to it, and hiding from it. */
function About({ thread, onChange }: { thread: ConversationThread; onChange: () => Promise<void> }) {
  const theme = useTheme();
  const router = useRouter();
  const [hiding, setHiding] = useState(false);
  const { salon } = thread;

  function hide() {
    Alert.alert(
      `Hide from ${salon.name}?`,
      'They won’t be able to see or contact you, unless you apply to one of their jobs.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide',
          style: 'destructive',
          onPress: async () => {
            setHiding(true);
            try {
              await api.hideFromSalon(salon.id);
              await onChange();
            } catch (err) {
              Alert.alert('Couldn’t hide your profile', errorMessage(err));
            } finally {
              setHiding(false);
            }
          },
        },
      ],
    );
  }

  return (
    <View style={[styles.about, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {thread.applications.length ? (
        thread.applications.map((application) => (
          <Pressable
            key={application.id}
            onPress={() => router.push({ pathname: '/applications/[id]', params: { id: application.id } })}
            accessibilityRole="button"
            style={styles.application}>
            <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
              {application.jobTitle}
            </Text>
            <Pill label={labelFor(APPLICATION_STATUSES, application.status)} tone="brand" />
          </Pressable>
        ))
      ) : (
        <Text variant="small" color="textSecondary">
          {salon.name} found your profile.
        </Text>
      )}
      <View style={styles.actions}>
        <Button
          title="Their salon"
          size="sm"
          variant="ghost"
          onPress={() => WebBrowser.openBrowserAsync(siteUrl(salon.path))}
        />
        {thread.hidden ? (
          <Text variant="caption" color="textMuted">
            You’ve hidden your profile from them.
          </Text>
        ) : (
          <Button title="Hide from them" size="sm" variant="ghost" loading={hiding} onPress={hide} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  about: {
    gap: Spacing.two,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  application: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
