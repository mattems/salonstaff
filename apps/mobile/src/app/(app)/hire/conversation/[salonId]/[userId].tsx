import { fillQuickReply, QUICK_REPLIES } from '@salonstaff/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chat } from '@/components/chat';
import { Pill } from '@/components/pill';
import { APPLICATION_TONES, applicationLabel } from '@/components/salon';
import { ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { api, type CandidateConversation } from '@/lib/api';
import { useMode } from '@/lib/mode';

/**
 * Your salon's conversation with a job seeker (D-19), from an application or their profile: live
 * while open (D-18), with quick replies about their latest application. Opening it reads it.
 */
export default function SalonConversationScreen() {
  const { salonId, userId } = useLocalSearchParams<{ salonId: string; userId: string }>();
  const { salons, refreshSalons } = useMode();
  const salon = salons.find((s) => s.id === salonId);
  const { data, error, loading, reload, setData } = useRequest(
    () => api.salon.conversation(salonId, userId),
    { key: `${salonId}/${userId}`, refetchOnFocus: true },
  );

  // Opening it read their messages: bring the Messages badge up to date.
  useEffect(() => {
    if (data) void refreshSalons();
  }, [data?.candidateId, refreshSalons]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;

  const firstName = data.name.split(' ')[0] || 'them';
  // Written about their latest application, if there is one.
  const latest = data.applications[0];
  const quickReplies = latest
    ? QUICK_REPLIES.map((reply) => ({
        label: reply.label,
        text: fillQuickReply(reply.text, {
          firstName,
          job: latest.jobTitle,
          salon: salon?.name ?? '',
        }),
      }))
    : [];

  return (
    <>
      <Stack.Screen options={{ title: data.name || 'Deleted account' }} />
      <Chat
        me="salon"
        quickReplies={quickReplies}
        messages={data.messages}
        setMessages={(update) =>
          setData((prev) => (prev ? { ...prev, messages: update(prev.messages) } : prev))
        }
        livePath={`/v1/employer/salons/${salonId}/candidates/${userId}/live`}
        onTheirs={() => void reload().then(refreshSalons)}
        canSend={data.canSend}
        sendHint={data.sendHint}
        placeholder={`Write to ${firstName}`}
        emptyText={
          latest
            ? `No messages yet. ${firstName} can reply once you write.`
            : `No messages yet. Introduce your salon: ${firstName} can reply once you write.`
        }
        send={(body) => api.salon.send(salonId, userId, body, latest?.id)}
        header={<About thread={data} salonId={salonId} salonName={salon?.name} />}
      />
    </>
  );
}

/** Which salon, and their applications to it. */
function About({
  thread,
  salonId,
  salonName,
}: {
  thread: CandidateConversation;
  salonId: string;
  salonName: string | undefined;
}) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.about, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {salonName ? (
        <Text variant="caption" color="textMuted">
          With {salonName}
        </Text>
      ) : null}
      {thread.applications.length ? (
        thread.applications.map((application) => (
          <Pressable
            key={application.id}
            onPress={() =>
              router.push({
                pathname: '/hire/application/[salonId]/[id]',
                params: { salonId, id: application.id },
              })
            }
            accessibilityRole="button"
            style={styles.application}>
            <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
              {application.jobTitle}
            </Text>
            <Pill label={applicationLabel(application.status)} tone={APPLICATION_TONES[application.status]} />
          </Pressable>
        ))
      ) : (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/hire/candidate/[salonId]/[userId]',
              params: { salonId, userId: thread.candidateId },
            })
          }
          accessibilityRole="button">
          <Text variant="small" color="brand">
            Hasn’t applied to you · See their profile
          </Text>
        </Pressable>
      )}
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
});
