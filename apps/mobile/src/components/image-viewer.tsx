import type { PortfolioItem } from '@salonstaff/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { mediaUrl } from '@/lib/config';

/** Full-screen, swipeable portfolio viewer. Pass `index = null` to hide. */
export function ImageViewer({
  items,
  index,
  onClose,
}: {
  items: PortfolioItem[];
  index: number | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(0);
  const visible = index !== null;
  const shown = visible ? current : 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onShow={() => setCurrent(index ?? 0)}
      onRequestClose={onClose}>
      <View style={styles.root}>
        {visible ? (
          <FlatList
            data={items}
            horizontal
            pagingEnabled
            initialScrollIndex={index ?? 0}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <View style={{ width, height }}>
                <Image
                  source={{ uri: mediaUrl(item.imageUrl) }}
                  style={styles.image}
                  contentFit="contain"
                />
              </View>
            )}
          />
        ) : null}
        <View style={[styles.top, { paddingTop: insets.top + Spacing.two }]}>
          <Text variant="smallStrong" style={styles.light}>
            {items.length ? `${shown + 1} / ${items.length}` : ''}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.close}>
            <Icon name="close" size={20} color="#ffffff" />
          </Pressable>
        </View>
        {items[shown]?.caption ? (
          <View style={[styles.caption, { paddingBottom: insets.bottom + Spacing.four }]}>
            <Text style={styles.light}>{items[shown]?.caption}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  image: { width: '100%', height: '100%' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  light: { color: '#ffffff' },
});
