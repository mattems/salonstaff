import type { PortfolioItem } from '@/lib/api';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { mediaUrl } from '@/lib/config';

/** Further than this down (or flicked faster than `CLOSE_VELOCITY`) and letting go closes it. */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 900;
/** How far in a pinch can zoom. */
const MAX_ZOOM = 3;
/** How far a double tap zooms in, around where it was. */
const DOUBLE_TAP_ZOOM = 2.5;
/** A second tap within this is a double tap; a single tap waits this long to be sure. */
const DOUBLE_TAP_MS = 300;

/**
 * Full-screen portfolio photos, as phones' own photo viewers work: swipe sideways between them, pinch
 * or double tap to zoom (then drag around the photo; double tap again to zoom out), tap to show or
 * hide the counter and caption, and swipe down (or the close button) to close, the photo following
 * the finger as the background fades. Pass `index = null` to hide.
 */
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
  const [chrome, setChrome] = useState(true);
  /** A photo is zoomed in: drags move around it, rather than closing or paging. */
  const [zoomed, setZoomed] = useState(false);
  const visible = index !== null;
  const shown = visible ? current : 0;
  const dragY = useSharedValue(0);

  const opened = () => {
    setCurrent(index ?? 0);
    setChrome(true);
    setZoomed(false);
    dragY.value = 0;
  };

  const close = useCallback(() => onClose(), [onClose]);

  // Down only, and only once it's clearly down: sideways swipes go to the photos' paging.
  const dismiss = usePanGesture({
    enabled: !zoomed,
    activeOffsetY: 12,
    failOffsetX: [-12, 12],
    onUpdate: (event) => {
      dragY.value = Math.max(0, event.translationY);
    },
    onDeactivate: (event) => {
      if (event.translationY > CLOSE_DISTANCE || event.velocityY > CLOSE_VELOCITY) {
        dragY.value = withTiming(height, { duration: 180 }, () => scheduleOnRN(close));
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    },
  });

  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dragY.value },
      { scale: interpolate(dragY.value, [0, height], [1, 0.8], 'clamp') },
    ],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragY.value, [0, height * 0.6], [1, 0], 'clamp'),
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragY.value, [0, 80], [1, 0], 'clamp'),
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onShow={opened}
      onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.flex}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
        <GestureDetector gesture={dismiss}>
          <Animated.View style={[styles.flex, photoStyle]}>
            {visible ? (
              <FlatList
                data={items}
                horizontal
                pagingEnabled
                scrollEnabled={!zoomed}
                initialScrollIndex={index ?? 0}
                getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) =>
                  setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))
                }
                renderItem={({ item }) => (
                  <ZoomablePhoto
                    uri={mediaUrl(item.imageUrl)}
                    width={width}
                    height={height}
                    onZoomChange={setZoomed}
                    onTap={() => setChrome((on) => !on)}
                    accessibilityLabel={item.caption ?? 'Portfolio photo'}
                  />
                )}
              />
            ) : null}
          </Animated.View>
        </GestureDetector>

        {chrome ? (
          <Animated.View
            style={[styles.top, { paddingTop: insets.top + Spacing.two }, chromeStyle]}
            pointerEvents="box-none">
            <Text variant="smallStrong" style={styles.light}>
              {items.length > 1 ? `${shown + 1} / ${items.length}` : ''}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.close}>
              <Icon name="close" size={20} color="#ffffff" />
            </Pressable>
          </Animated.View>
        ) : null}
        {chrome && items[shown]?.caption ? (
          <Animated.View
            style={[styles.caption, { paddingBottom: insets.bottom + Spacing.four }, chromeStyle]}
            pointerEvents="none">
            <Text style={styles.light}>{items[shown]?.caption}</Text>
          </Animated.View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * One photo, fitted to the screen. Pinch zooms in (iOS's own zooming scroll view), as does a double
 * tap (around the spot tapped, or back out when zoomed); a single tap toggles the counter and
 * caption. It says when it's zoomed so the viewer stops paging and closing.
 */
function ZoomablePhoto({
  uri,
  width,
  height,
  onZoomChange,
  onTap,
  accessibilityLabel,
}: {
  uri: string;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
  onTap: () => void;
  accessibilityLabel: string;
}) {
  const [zoomed, setZoomed] = useState(false);
  const scroller = useRef<ScrollViewInstance>(null);
  const lastTap = useRef(0);
  const singleTap = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (singleTap.current) clearTimeout(singleTap.current);
    },
    [],
  );

  /** Taps land on the photo's own (unzoomed) coordinates, which is what zooming to a rect takes. */
  const onPress = (e: GestureResponderEvent) => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (singleTap.current) clearTimeout(singleTap.current);
      singleTap.current = null;
      const { locationX, locationY } = e.nativeEvent;
      const w = width / DOUBLE_TAP_ZOOM;
      const h = height / DOUBLE_TAP_ZOOM;
      scroller.current?.scrollResponderZoomTo(
        zoomed
          ? { x: 0, y: 0, width, height, animated: true }
          : { x: locationX - w / 2, y: locationY - h / 2, width: w, height: h, animated: true },
      );
      return;
    }
    lastTap.current = now;
    singleTap.current = setTimeout(() => {
      singleTap.current = null;
      onTap();
    }, DOUBLE_TAP_MS);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const now = (e.nativeEvent.zoomScale ?? 1) > 1.01;
    if (now === zoomed) return;
    setZoomed(now);
    onZoomChange(now);
  };
  return (
    <ScrollView
      ref={scroller}
      style={{ width, height }}
      contentContainerStyle={{ width, height }}
      maximumZoomScale={MAX_ZOOM}
      minimumZoomScale={1}
      bouncesZoom
      centerContent
      scrollEnabled={zoomed}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={32}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Double tap to zoom"
        style={styles.flex}>
        <Image source={{ uri }} style={styles.image} contentFit="contain" />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { backgroundColor: '#000000' },
  image: { width: '100%', height: '100%' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
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
