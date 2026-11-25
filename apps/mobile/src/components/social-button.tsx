import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Provider = 'google' | 'apple';

/** Provider-branded button used for Google, and for Apple where the native button isn't available. */
export function SocialButton({
  provider,
  label,
  onPress,
  loading,
  disabled,
}: {
  provider: Provider;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const isApple = provider === 'apple';
  // Apple's guidelines: black (or white in dark mode) with the Apple mark.
  const bg = isApple ? theme.text : theme.surface;
  const fg = isApple ? theme.background : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: isApple ? bg : theme.border,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {isApple ? (
            // The Apple mark (U+F8FF) only exists in Apple system fonts.
            Platform.OS === 'ios' ? (
              <Text style={[styles.appleMark, { color: fg }]}>{'\uF8FF'}</Text>
            ) : null
          ) : (
            <GoogleMark />
          )}
          <Text variant="bodyStrong" style={{ color: fg }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Simple four-colour "G" built from text so we don't ship an image asset. */
function GoogleMark() {
  return (
    <View style={styles.gWrap}>
      <Text style={styles.g}>G</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  appleMark: { fontSize: 20, lineHeight: 22, marginTop: -2 },
  gWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  g: { fontSize: 17, lineHeight: 20, fontWeight: '800', color: '#4285F4' },
});
