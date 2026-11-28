import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { SalonChips } from '@/components/salon';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { api, type SalonConversation } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useMode } from '@/lib/mode';

/** Every salon's conversations with job seekers (D-19, D-20), latest first. */
export default function MessagesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { salons, refreshSalons } = useMode();
  const [salonId, setSalonId] = useState<string>();
  const { data, error, loading, refreshing, reload, refresh } = useRequest(
    async () => {
      // The tab's badge comes from your salons' counts: bring them up to date too.
      void refreshSalons();
      return api.salon.conversations();
    },
    { refetchOnFocus: true },
  );

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;

  const several = salons.length > 1;
  const items = (data?.items ?? []).filter((c) => !salonId || c.salon.id === salonId);

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => `${item.salon.id}/${item.candidateId}`}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.brand} colors={[theme.brand]} />
      }
      ListHeaderComponent={<SalonChips salons={salons} value={salonId} onChange={setSalonId} />}
      ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
      renderItem={({ item }) => (
        <Row
          item={item}
          showSalon={several && !salonId}
          onPress={() =>
            router.push({
              pathname: '/hire/conversation/[salonId]/[userId]',
              params: { salonId: item.salon.id, userId: item.candidateId },
            })
          }
        />
      )}
      ListEmptyComponent={
        <EmptyView
          icon="chat"
          title="No conversations yet"
          body="Write to an applicant from their application. Their replies show up here."
          actionLabel="See your applicants"
          onAction={() => router.navigate('/applicants')}
        />
      }
    />
  );
}

/** What the last message said, from the salon's side. */
function preview(item: SalonConversation) {
  const last = item.lastMessage;
  if (!last) return '';
  if (last.kind === 'number_viewed') return 'Looked at their number';
  return `${last.from === 'salon' ? `${last.senderName ?? 'You'}: ` : ''}${last.body}`;
}

function Row({
  item,
  showSalon,
  onPress,
}: {
  item: SalonConversation;
  showSalon: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const unread = item.unreadMessages > 0;
  const name = item.name || 'Deleted account';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}${showSalon ? `, ${item.salon.name}` : ''}${unread ? ', unread' : ''}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={[styles.dot, { backgroundColor: unread ? theme.brand : 'transparent' }]} />
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={1} style={styles.flex}>
            {name}
          </Text>
          <Text variant="caption" color="textMuted">
            {timeAgo(item.lastMessageAt)}
          </Text>
        </View>
        {showSalon ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {item.salon.name}
          </Text>
        ) : null}
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
