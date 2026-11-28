import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { useTheme } from '@/hooks/use-theme';
import { mediaUrl } from '@/lib/config';
import { initials } from '@/lib/format';

/** Round profile photo, or initials on the brand colour when there isn't one. */
export function ProfilePhoto({
  photoUrl,
  firstName,
  lastName,
  fallback,
  size = 96,
}: {
  photoUrl: string | null | undefined;
  firstName?: string | null;
  lastName?: string | null;
  fallback?: string | null;
  size?: number;
}) {
  const theme = useTheme();
  const uri = mediaUrl(photoUrl);
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[shape, { backgroundColor: theme.surfaceMuted }]}
        contentFit="cover"
        transition={150}
        accessibilityLabel="Profile photo"
      />
    );
  }
  return (
    <View style={[shape, styles.fallback, { backgroundColor: theme.brand }]}>
      {/* Its own line height: the body text's fixed one clips large initials. */}
      <Text
        style={{
          color: theme.onBrand,
          fontSize: size * 0.36,
          lineHeight: size * 0.44,
          fontWeight: '700',
        }}>
        {initials(firstName, lastName, fallback ?? '?')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
