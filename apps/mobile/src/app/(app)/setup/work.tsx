import { JOB_ROLES, type JobRole } from '@salonstaff/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon, type IconName } from '@/components/icon';
import { SetupScreen } from '@/components/setup-screen';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSetup } from '@/lib/setup';

const MAX_ROLES = 6;
const MAX_YEARS = 60;
const GROUPS = [
  { group: 'hair', label: 'Hair' },
  { group: 'beauty', label: 'Beauty' },
  { group: 'salon', label: 'Salon' },
] as const;

/** Step 2: the roles they're after, and how long they've been doing it. */
export default function SetupWorkScreen() {
  const theme = useTheme();
  const { draft, update, next } = useSetup();
  const years = draft.yearsExperience;

  function toggle(role: JobRole) {
    const has = draft.roles.includes(role);
    if (!has && draft.roles.length >= MAX_ROLES) return;
    update({ roles: has ? draft.roles.filter((r) => r !== role) : [...draft.roles, role] });
  }

  return (
    <SetupScreen
      step="work"
      title="What do you do?"
      subtitle={`Choose the roles you’re after, up to ${MAX_ROLES}. Salons find you by these.`}
      footer={
        <Button
          title="Continue"
          disabled={draft.roles.length === 0}
          onPress={() => next('work')}
        />
      }>
      {GROUPS.map(({ group, label }) => (
        <View key={group} style={styles.group}>
          <Text variant="overline" color="textMuted">
            {label}
          </Text>
          <View style={styles.chips}>
            {JOB_ROLES.filter((r) => r.group === group).map((r) => {
              const selected = draft.roles.includes(r.value);
              return (
                <Chip
                  key={r.value}
                  label={r.label}
                  selected={selected}
                  disabled={!selected && draft.roles.length >= MAX_ROLES}
                  onPress={() => toggle(r.value)}
                />
              );
            })}
          </View>
        </View>
      ))}

      <View style={[styles.years, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.flex}>
          <Text variant="bodyStrong">Years of experience</Text>
          <Text variant="small" color="textSecondary">
            {years === 0 ? 'Starting out, or under a year' : `${years} year${years === 1 ? '' : 's'}`}
          </Text>
        </View>
        <Step
          icon="minus"
          label="One year less"
          disabled={years === 0}
          onPress={() => update({ yearsExperience: years - 1 })}
        />
        <Text variant="heading" style={styles.count} accessibilityLabel={`${years} years`}>
          {years}
        </Text>
        <Step
          icon="add"
          label="One year more"
          disabled={years >= MAX_YEARS}
          onPress={() => update({ yearsExperience: years + 1 })}
        />
      </View>
    </SetupScreen>
  );
}

function Step({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: theme.brandSoft, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
      ]}>
      <Icon name={icon} size={16} color={theme.brand} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  years: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.two,
  },
  step: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
