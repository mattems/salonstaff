import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { api, type MyConversation } from '@/lib/api';
import { timeAgo } from '@/lib/format';

/** Your conversations with salons (D-19): about your applications, or from them finding you. */
export default function InboxScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data, error, loading, refreshing, reload, refresh } = useRequest(api.conversations, {
    refetchOnFocus: true,
  });

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;

  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.brand} colors={[theme.brand]} />
      }
      ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
      renderItem={({ item }) => (
        <Row item={item} onPress={() => router.push({ pathname: '/inbox/[id]', params: { id: item.id } })} />
      )}
      ListEmptyComponent={
        <EmptyView
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

/** What the last message said, from your side. */
function preview(item: MyConversation) {
  const last = item.lastMessage;
  if (!last) return '';
  if (last.kind === 'number_viewed') return 'Looked at your number';
  return `${last.from === 'seeker' ? 'You: ' : ''}${last.body}`;
}

function Row({ item, onPress }: { item: MyConversation; onPress: () => void }) {
  const theme = useTheme();
  const unread = item.unreadMessages > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.salon.name}${unread ? ', unread' : ''}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={[styles.dot, { backgroundColor: unread ? theme.brand : 'transparent' }]} />
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={1} style={styles.flex}>
            {item.salon.name}
          </Text>
          <Text variant="caption" color="textMuted">
            {timeAgo(item.lastMessageAt)}
          </Text>
        </View>
        <Text variant="small" color="textSecondary" numberOfLines={1}>
          {preview(item)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.four, paddingBottom: Spacing.seven, flexGrow: 1 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.five },
  row: { flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.three },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
