import { useRouter } from 'expo-router';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage, type MyConversation, type ProfileContact } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';

/** Salons that messaged you or looked at your number (D-13). */
export default function InboxScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { refresh: refreshMe } = useAuth();
  const { data, error, loading, refreshing, reload, refresh } = useRequest(
    async () => {
      const [contacts, conversations] = await Promise.all([api.contacts(), api.conversations()]);
      return { items: contacts.items, conversations: conversations.items };
    },
    { refetchOnFocus: true },
  );

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  const items = data?.items ?? [];
  const conversations = data?.conversations ?? [];
  const unread = items.filter((item) => !item.read).length;

  async function markAll() {
    try {
      await api.markRead();
      await Promise.all([reload(), refreshMe()]);
    } catch (err) {
      Alert.alert('Couldn’t mark them read', errorMessage(err));
    }
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.brand} colors={[theme.brand]} />
      }
      ListHeaderComponent={
        conversations.length || items.length ? (
          <View style={styles.headerBlock}>
            {conversations.length ? (
              <View style={styles.section}>
                <Text variant="overline" color="textMuted">
                  About your applications
                </Text>
                {conversations.map((c) => (
                  <ConversationRow
                    key={c.id}
                    item={c}
                    onPress={() => router.push({ pathname: '/applications/[id]', params: { id: c.id } })}
                  />
                ))}
              </View>
            ) : null}
            {items.length ? (
              <View style={styles.header}>
                <Text variant="overline" color="textMuted" style={styles.flex}>
                  Salons that found your profile
                </Text>
                {unread ? <Button title="Mark all read" size="sm" variant="ghost" onPress={markAll} /> : null}
              </View>
            ) : null}
          </View>
        ) : undefined
      }
      ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
      renderItem={({ item }) => (
        <Row item={item} onPress={() => router.push({ pathname: '/inbox/[id]', params: { id: item.id } })} />
      )}
      ListEmptyComponent={
        conversations.length ? undefined : <EmptyView
          icon="inbox"
          title="Nothing yet"
          body="When a salon messages you or looks at your number, it shows here."
          actionLabel="Check who can see your profile"
          onAction={() => router.push('/profile/sharing')}
        />
      }
    />
  );
}

function ConversationRow({ item, onPress }: { item: MyConversation; onPress: () => void }) {
  const theme = useTheme();
  const unread = item.unreadMessages > 0;
  const last = item.lastMessage;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.job.salon.name}, ${item.job.title}${unread ? ', unread' : ''}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={[styles.dot, { backgroundColor: unread ? theme.brand : 'transparent' }]} />
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={1} style={styles.flex}>
            {item.job.salon.name}
          </Text>
          {last ? (
            <Text variant="caption" color="textMuted">
              {timeAgo(last.createdAt)}
            </Text>
          ) : null}
        </View>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {item.job.title}
        </Text>
        {last ? (
          <Text variant="small" color="textSecondary" numberOfLines={1}>
            {last.from === 'seeker' ? 'You: ' : ''}
            {last.body}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Row({ item, onPress }: { item: ProfileContact; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.salon.name}${item.read ? '' : ', unread'}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={[styles.dot, { backgroundColor: item.read ? 'transparent' : theme.brand }]} />
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text variant={item.read ? 'body' : 'bodyStrong'} numberOfLines={1} style={styles.flex}>
            {item.salon.name}
          </Text>
          <Text variant="caption" color="textMuted">
            {timeAgo(item.createdAt)}
          </Text>
        </View>
        <View style={styles.titleRow}>
          <Icon name={item.kind === 'message' ? 'mail' : 'phone'} size={14} color={theme.textMuted} />
          <Text variant="small" color="textSecondary" numberOfLines={1} style={styles.flex}>
            {item.kind === 'message' ? (item.message ?? '') : 'Looked at your number'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.four, paddingBottom: Spacing.seven, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.two },
  headerBlock: { gap: Spacing.four },
  section: { gap: Spacing.one },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.five },
  row: { flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.three },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
