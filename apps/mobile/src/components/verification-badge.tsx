import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { VERIFICATION_LEVELS } from '@/lib/format';

type Level = 0 | 1 | 2;

/** Big, prominent badge for the seeker's verification level. */
export function VerificationBadge({ level: raw, compact = false }: { level: number; compact?: boolean }) {
  const theme = useTheme();
  const level = Math.min(2, Math.max(0, Math.trunc(raw))) as Level;
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
        <Icon name={level === 0 ? 'shield' : 'verified'} size={13} color={palette.fg} />
        <Text variant="caption" style={{ color: palette.fg, fontWeight: '700' }}>
          {info.label}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <View style={[styles.iconWrap, { backgroundColor: palette.fg }]}>
        <Icon name={level === 0 ? 'shield' : 'verified'} size={22} color={palette.bg} />
      </View>
      <View style={styles.textWrap}>
        <Text variant="heading" style={{ color: palette.fg }}>
          {info.label}
        </Text>
        <Text variant="small" color="textSecondary">
          {info.description}
        </Text>
        {/* The two checks behind the level, rather than a "level n of 2" to decode. */}
        <View style={styles.checks}>
          <CheckMark done={level >= 1} label="Your ID" color={palette.fg} />
          <CheckMark done={level >= 2} label="Right to work" color={palette.fg} />
        </View>
      </View>
    </View>
  );
}

function CheckMark({ done, label, color }: { done: boolean; label: string; color: string }) {
  const theme = useTheme();
  return (
    <View
      style={styles.check}
      accessible
      accessibilityLabel={`${label}: ${done ? 'checked' : 'not checked yet'}`}>
      <Icon name={done ? 'done' : 'circle'} size={16} color={done ? color : theme.textMuted} />
      <Text variant="smallStrong" color={done ? 'text' : 'textMuted'}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  checks: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four, marginTop: Spacing.one },
  check: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
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
