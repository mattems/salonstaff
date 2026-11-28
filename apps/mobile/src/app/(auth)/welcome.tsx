import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The welcome video, muted and looping behind the slides. A placeholder until Matt picks the real
 * clip (a hairdresser at work): portrait, 8–15 seconds, under about 4 MB. Swap the file and its poster
 * (the first frame, shown until the video plays and when Reduce Motion is on).
 */
const VIDEO = require('@/assets/video/welcome.mp4');
const POSTER = require('@/assets/video/welcome-poster.jpg');

const SLIDES = [
  {
    title: 'Your next salon job, close to home',
    body: 'Hair, barbering, beauty and nails. Jobs from salons near you.',
  },
  {
    title: 'Apply in a tap',
    body: 'Send your profile in seconds, then chat with the salon right here.',
  },
  {
    title: 'Get seen by salons',
    body: 'Your photos, skills and work rights, ready for when a salon is hiring.',
  },
];

const WHITE = '#ffffff';
const SOFT_WHITE = 'rgba(255,255,255,0.78)';

/**
 * The first thing anyone signed out sees: a video of salon work, with a few lines to swipe through,
 * "Get started" (which asks who they are) and a way in for people who already have an account.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [stillOnly, setStillOnly] = useState(false);

  const player = useVideoPlayer(VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
    // Don't stop someone's music for a silent video.
    p.audioMixingMode = 'mixWithOthers';
  });

  // Reduce Motion: the still only.
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setStillOnly(on);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setStillOnly);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Plays only while this screen is in front, with light status bar text over it.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      if (!stillOnly) player.play();
      return () => {
        player.pause();
        setStatusBarStyle('auto');
      };
    }, [player, stillOnly]),
  );

  return (
    <View style={styles.screen}>
      <Image source={POSTER} style={StyleSheet.absoluteFill} contentFit="cover" />
      {stillOnly ? null : (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
          accessible={false}
        />
      )}
      <View style={[StyleSheet.absoluteFill, styles.fade]} pointerEvents="none" />

      <View style={[styles.brand, { top: insets.top + Spacing.three }]} pointerEvents="none">
        <View style={[styles.logo, { backgroundColor: theme.brand }]}>
          <Text variant="smallStrong" style={{ color: theme.onBrand }}>
            S
          </Text>
        </View>
        <Text variant="bodyStrong" style={styles.white}>
          Salon Staff
        </Text>
      </View>

      {/* The whole screen swipes; each slide's words sit above the buttons. */}
      <FlatList
        data={SLIDES}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        style={StyleSheet.absoluteFill}
        onScroll={(e) => {
          const next = Math.round(e.nativeEvent.contentOffset.x / width);
          if (next !== page) setPage(next);
        }}
        scrollEventThrottle={32}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width, paddingBottom: insets.bottom + 168 }]}>
            <Text variant="display" style={[styles.white, styles.center]} accessibilityRole="header">
              {item.title}
            </Text>
            <Text variant="body" style={[styles.soft, styles.center]}>
              {item.body}
            </Text>
          </View>
        )}
      />

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + Spacing.four }]}
        pointerEvents="box-none">
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <View
              key={s.title}
              style={[
                styles.dot,
                i === page ? { backgroundColor: theme.brand, width: 18 } : styles.dotIdle,
              ]}
            />
          ))}
        </View>
        <Button title="Get started" onPress={() => router.push('/who')} style={styles.cta} />
        <Pressable
          onPress={() => router.push('/sign-in')}
          hitSlop={8}
          accessibilityRole="button"
          style={styles.signIn}>
          <Text variant="small" style={styles.soft}>
            Already have an account? <Text variant="smallStrong" style={styles.white}>Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  fade: {
    backgroundImage:
      'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.82) 62%, rgba(0,0,0,0.96) 100%)',
  },
  brand: {
    position: 'absolute',
    left: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slide: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.six,
    gap: Spacing.three,
  },
  white: { color: WHITE },
  soft: { color: SOFT_WHITE },
  center: { textAlign: 'center' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.five,
    gap: Spacing.four,
    alignItems: 'stretch',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
  dot: { height: 6, width: 6, borderRadius: 3 },
  dotIdle: { backgroundColor: 'rgba(255,255,255,0.35)' },
  cta: { borderRadius: Radius.pill, minHeight: 54 },
  signIn: { alignSelf: 'center', paddingVertical: Spacing.one },
});
