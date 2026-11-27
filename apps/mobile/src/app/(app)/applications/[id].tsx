import { APPLICATION_STATUSES, labelFor, withMessage } from '@salonstaff/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useLiveConversation } from '@/hooks/use-live-conversation';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage, type ApplicationMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, timeAgo } from '@/lib/format';

/** One application and the conversation with the salon about it (D-17). */
export default function ApplicationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh: refreshMe } = useAuth();
  const { data, error, loading, reload, setData } = useRequest(() => api.application(id), {
    key: id,
    refetchOnFocus: true,
  });
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const list = useRef<FlatList<ApplicationMessage>>(null);
  // The newest message when you scrolled up from the bottom to read; null while you're at the
  // bottom. Anything the salon sends after it waits below, behind the "new messages" button.
  const [readTo, setReadTo] = useState<string | null>(null);
  // Live while it's on screen (D-18). A message from the salon is shown at once, then the
  // conversation is read again, which marks it read, and the Inbox badge follows.
  const { typing, live } = useLiveConversation(`/v1/me/applications/${id}/live`, 'seeker', {
    onMessage(message) {
      setData((prev) => (prev ? { ...prev, messages: withMessage(prev.messages, message) } : prev));
      if (message.from === 'salon') void reload().then(refreshMe);
    },
    onReconnect: () => void reload().then(refreshMe),
  });

  // Opening it read the salon's messages: bring the Inbox badge up to date.
  useEffect(() => {
    if (data) void refreshMe();
  }, [data?.id, refreshMe]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;

  async function send() {
    const body = draft.trim();
    if (!body || !data) return;
    setSending(true);
    try {
      const message = await api.sendApplicationMessage(id, body);
      setDraft('');
      live.current?.sent();
      setData((prev) => (prev ? { ...prev, messages: withMessage(prev.messages, message) } : prev));
      toNewest();
    } catch (err) {
      Alert.alert('Couldn’t send it', errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  // The list is inverted: offset 0 is the bottom, where the newest message is.
  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const atBottom = event.nativeEvent.contentOffset.y <= AT_BOTTOM_WITHIN;
    if (atBottom && readTo !== null) setReadTo(null);
    if (!atBottom && readTo === null) setReadTo(data?.messages.at(-1)?.id ?? null);
  }

  function toNewest() {
    list.current?.scrollToOffset({ offset: 0, animated: true });
  }

  const { job } = data;
  const readIndex = readTo === null ? -1 : data.messages.findIndex((m) => m.id === readTo);
  const newBelow =
    readIndex < 0 ? 0 : data.messages.slice(readIndex + 1).filter((m) => m.from === 'salon').length;
  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <Stack.Screen options={{ title: job.salon.name }} />
      <Pressable
        onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id, path: job.path } })}
        accessibilityRole="button"
        style={[styles.job, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {job.title}
          </Text>
          <Text variant="caption" color="textMuted">
            Applied {formatDate(data.createdAt)}
          </Text>
        </View>
        <Pill label={labelFor(APPLICATION_STATUSES, data.status)} tone="brand" />
      </Pressable>
      {data.messages.length ? (
        <View style={styles.flex}>
          {/* Inverted, so the newest message stays at the bottom, above the keyboard too. */}
          <FlatList
            ref={list}
            inverted
            data={[...data.messages].reverse()}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            keyboardDismissMode="interactive"
            onScroll={onScroll}
            scrollEventThrottle={100}
            // Reading further up, a new message doesn't move what you're reading.
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
              autoscrollToTopThreshold: AT_BOTTOM_WITHIN,
            }}
            renderItem={({ item }) => <Bubble message={item} />}
          />
          {readTo !== null && (
            <Pressable
              onPress={toNewest}
              accessibilityRole="button"
              accessibilityLabel={newBelow ? newMessagesLabel(newBelow) : 'Go to the newest message'}
              style={[
                styles.toNewest,
                newBelow
                  ? { backgroundColor: theme.brand }
                  : { backgroundColor: theme.surface, borderColor: theme.border },
              ]}>
              {newBelow ? (
                <Text variant="smallStrong" style={{ color: theme.onBrand }}>
                  {newMessagesLabel(newBelow)}
                </Text>
              ) : null}
              <Icon name="chevronDown" size={14} color={newBelow ? theme.onBrand : theme.text} />
            </Pressable>
          )}
        </View>
      ) : (
        <View style={[styles.flex, styles.emptyWrap]}>
          <Text variant="small" color="textSecondary" style={styles.empty}>
            No messages yet. When the salon writes about your application, you can reply here.
          </Text>
        </View>
      )}
      {typing && (
        <Text variant="caption" color="textMuted" style={styles.typing} accessibilityLiveRegion="polite">
          {typing} is typing…
        </Text>
      )}
      <View
        style={[
          styles.composer,
          { borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, Spacing.three) },
        ]}>
        {data.canSend ? (
          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                live.current?.typing();
              }}
              placeholder={`Reply to ${job.salon.name}`}
              placeholderTextColor={theme.textMuted}
              multiline
              maxLength={2000}
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            />
            <Button
              title="Send"
              size="sm"
              loading={sending}
              disabled={!draft.trim()}
              onPress={send}
              style={styles.send}
            />
          </View>
        ) : (
          <Text variant="small" color="textSecondary">
            {data.sendHint}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message }: { message: ApplicationMessage }) {
  const theme = useTheme();
  const mine = message.from === 'seeker';
  return (
    <View style={[styles.bubbleRow, mine ? styles.right : styles.left]}>
      <Text variant="caption" color="textMuted" style={mine ? styles.rightText : undefined}>
        {mine ? 'You' : (message.senderName ?? 'The salon')} · {timeAgo(message.createdAt)}
      </Text>
      <View
        style={[
          styles.bubble,
          { backgroundColor: mine ? theme.brand : theme.surface, borderColor: theme.border },
        ]}>
        <Text style={{ color: mine ? theme.onBrand : theme.text }} selectable>
          {message.body}
        </Text>
      </View>
    </View>
  );
}

function newMessagesLabel(count: number) {
  return count === 1 ? '1 new message' : `${count} new messages`;
}

/** How close to the bottom still counts as reading the newest message. */
const AT_BOTTOM_WITHIN = 40;
const COMPOSER_HEIGHT = 44;
const LINE_HEIGHT = 20;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.four, gap: Spacing.three, flexGrow: 1 },
  job: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typing: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.two },
  toNewest: {
    position: 'absolute',
    bottom: Spacing.three,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 36,
    minWidth: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  emptyWrap: { justifyContent: 'center', padding: Spacing.five },
  empty: { textAlign: 'center' },
  bubbleRow: { maxWidth: '85%', gap: Spacing.half },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  rightText: { textAlign: 'right' },
  bubble: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  composer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // The box and Send share a height; Send stays at the bottom as a long reply grows the box.
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: {
    flex: 1,
    minHeight: COMPOSER_HEIGHT,
    maxHeight: 140,
    paddingHorizontal: Spacing.three,
    // iOS adds its own top inset to a multi-line box unless both are set: this centres one line.
    paddingTop: (COMPOSER_HEIGHT - LINE_HEIGHT) / 2,
    paddingBottom: (COMPOSER_HEIGHT - LINE_HEIGHT) / 2,
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    textAlignVertical: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  send: { minHeight: COMPOSER_HEIGHT },
});
