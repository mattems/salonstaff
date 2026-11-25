import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<Tone, { bg: ThemeColor; fg: ThemeColor }> = {
  brand: { bg: 'brandSoft', fg: 'brand' },
  success: { bg: 'successSoft', fg: 'success' },
  warning: { bg: 'warningSoft', fg: 'warning' },
  danger: { bg: 'dangerSoft', fg: 'danger' },
  info: { bg: 'infoSoft', fg: 'info' },
  neutral: { bg: 'surfaceMuted', fg: 'textSecondary' },
};

export function Pill({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const theme = useTheme();
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: theme[t.bg] }]}>
      {icon ? <Icon name={icon} size={11} color={theme[t.fg]} /> : null}
      <Text variant="caption" style={[styles.label, { color: theme[t.fg] }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  label: { fontWeight: '700' },
});
