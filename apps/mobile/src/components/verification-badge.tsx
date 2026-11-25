import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { VERIFICATION_LEVELS } from '@/lib/format';

type Level = 0 | 1 | 2;

/** Big, prominent badge for the seeker's verification level. */
export function VerificationBadge({ level, compact = false }: { level: Level; compact?: boolean }) {
  const theme = useTheme();
  const info = VERIFICATION_LEVELS[level];
  const palette =
    level === 2
      ? { bg: theme.successSoft, fg: theme.success }
      : level === 1
        ? { bg: theme.infoSoft, fg: theme.info }
        : { bg: theme.warningSoft, fg: theme.warning };

  if (compact) {
    return (
      <View style={[styles.compact, { backgroundColor: palette.bg }]}>
        <Icon name={level === 0 ? 'mail' : 'verified'} size={13} color={palette.fg} />
        <Text variant="caption" style={{ color: palette.fg, fontWeight: '700' }}>
          {info.label}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <View style={[styles.iconWrap, { backgroundColor: palette.fg }]}>
        <Icon name={level === 0 ? 'mail' : 'verified'} size={22} color={palette.bg} />
      </View>
      <View style={styles.textWrap}>
        <Text variant="overline" style={{ color: palette.fg }}>
          Level {level} of 2
        </Text>
        <Text variant="heading" style={{ color: palette.fg }}>
          {info.label}
        </Text>
        <Text variant="small" color="textSecondary">
          {info.description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
    borderRadius: Radius.lg,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1, gap: 2 },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
});
