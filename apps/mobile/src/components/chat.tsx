import { withMessage } from '@salonstaff/shared';
import { type ReactNode, useRef, useState } from 'react';
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
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useLiveConversation } from '@/hooks/use-live-conversation';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage, type Message } from '@/lib/api';
import { timeAgo } from '@/lib/format';

/**
 * The job seeker's conversation with a salon (D-19): live while on screen (D-18), with a "new
 * messages" button when the salon writes while you're reading further up, and the reply box.
 */
export function Chat({
  messages,
  setMessages,
  livePath,
  onTheirs,
  canSend,
  sendHint,
  placeholder,
  emptyText,
  send,
  header,
}: {
  messages: Message[];
  /** Changes the screen's copy of the messages. */
  setMessages: (update: (messages: Message[]) => Message[]) => void;
  /** The conversation's socket, once there is one. */
  livePath: string | undefined;
  /** The salon wrote, or the socket came back: read the conversation again (marks it read). */
  onTheirs: () => void;
  canSend: boolean;
  sendHint: string | null;
  placeholder: string;
  emptyText: string;
  send: (body: string) => Promise<Message>;
  /** Above the messages, e.g. the job. */
  header?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const list = useRef<FlatList<Message>>(null);
  // The newest message when you scrolled up from the bottom to read; null while you're at the
  // bottom. Anything the salon sends after it waits below, behind the "new messages" button.
  const [readTo, setReadTo] = useState<string | null>(null);
  const { typing, live } = useLiveConversation(livePath, 'seeker', {
    onMessage(message) {
      setMessages((prev) => withMessage(prev, message));
      if (message.from === 'salon') onTheirs();
    },
    onReconnect: onTheirs,
  });

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const message = await send(body);
      setDraft('');
      live.current?.sent();
      setMessages((prev) => withMessage(prev, message));
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
    if (!atBottom && readTo === null) setReadTo(messages.at(-1)?.id ?? null);
  }

  function toNewest() {
    list.current?.scrollToOffset({ offset: 0, animated: true });
  }

  const readIndex = readTo === null ? -1 : messages.findIndex((m) => m.id === readTo);
  const newBelow =
    readIndex < 0 ? 0 : messages.slice(readIndex + 1).filter((m) => m.from === 'salon').length;
  const newestFirst = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      {header}
      {messages.length ? (
        <View style={styles.flex}>
          {/* Inverted, so the newest message stays at the bottom, above the keyboard too. */}
          <FlatList
            ref={list}
            inverted
            data={newestFirst}
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
            renderItem={({ item, index }) => (
              <Item
                message={item}
                before={newestFirst.slice(index + 1).find((m) => m.kind === 'text')}
              />
            )}
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
            {emptyText}
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
        {canSend ? (
          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                live.current?.typing();
              }}
              placeholder={placeholder}
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
              onPress={submit}
              style={styles.send}
            />
          </View>
        ) : (
          <Text variant="small" color="textSecondary">
            {sendHint}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * A message, or a line saying the salon looked at your number; "About {job}" when it differs from
 * the last message before it (`before`).
 */
function Item({ message, before }: { message: Message; before: Message | undefined }) {
  const about = message.about?.jobTitle;
  const turned = about && about !== before?.about?.jobTitle;
  return (
    <View style={styles.item}>
      {turned ? (
        <Text variant="caption" color="textMuted" style={styles.centred}>
          About {about}
        </Text>
      ) : null}
      {message.kind === 'number_viewed' ? (
        <Text variant="caption" color="textMuted" style={styles.centred}>
          {message.senderName ?? 'The salon'} looked at your number · {timeAgo(message.createdAt)}
        </Text>
      ) : (
        <Bubble message={message} />
      )}
    </View>
  );
}

function Bubble({ message }: { message: Message }) {
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
  item: { gap: Spacing.three },
  centred: { textAlign: 'center' },
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
