import type { PortfolioItem } from '@/lib/api';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mediaUrl } from '@/lib/config';

const GAP = 4;

/** Square 3-column grid. `onPressItem` receives the index; `badge` renders over each tile. */
export function PortfolioGrid({
  items,
  onPressItem,
  onLongPressItem,
  renderBadge,
}: {
  items: PortfolioItem[];
  onPressItem?: (index: number) => void;
  onLongPressItem?: (index: number) => void;
  renderBadge?: (item: PortfolioItem) => React.ReactNode;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const tile = width ? Math.floor((width - GAP * 2) / 3) : 0;

  return (
    <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {tile > 0
        ? items.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => onPressItem?.(index)}
              onLongPress={() => onLongPressItem?.(index)}
              accessibilityRole="imagebutton"
              accessibilityLabel={item.caption ?? `Portfolio photo ${index + 1}`}
              style={({ pressed }) => [
                { width: tile, height: tile, opacity: pressed ? 0.8 : 1 },
                styles.tile,
                { backgroundColor: theme.surfaceMuted },
              ]}>
              <Image source={{ uri: mediaUrl(item.imageUrl) }} style={styles.image} contentFit="cover" />
              {renderBadge ? <View style={styles.badge}>{renderBadge(item)}</View> : null}
            </Pressable>
          ))
        : null}
    </View>
  );
}

/** Placeholder tile used for "add photos". */
export function AddTile({ onPress, size }: { onPress: () => void; size: number }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add photos"
      style={[styles.tile, styles.add, { width: size, height: size, borderColor: theme.border }]}>
      <Icon name="addPhoto" size={24} color={theme.brand} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { borderRadius: Radius.sm, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  badge: { position: 'absolute', top: 4, right: 4 },
  add: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
