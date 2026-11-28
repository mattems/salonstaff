import { JOB_ROLES, type JobRole } from '@salonstaff/shared';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { SetupScreen } from '@/components/setup-screen';
import { Text } from '@/components/text';
import { YearsStepper } from '@/components/years-stepper';
import { Spacing } from '@/constants/theme';
import { useSetup } from '@/lib/setup';

const MAX_ROLES = 6;
const GROUPS = [
  { group: 'hair', label: 'Hair' },
  { group: 'beauty', label: 'Beauty' },
  { group: 'salon', label: 'Salon' },
] as const;

/** Step 2: the roles they're after, and how long they've been doing it. */
export default function SetupWorkScreen() {
  const { draft, update, next } = useSetup();

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

      <View style={styles.yearsBox}>
        <YearsStepper years={draft.yearsExperience} onChange={(yearsExperience) => update({ yearsExperience })} />
      </View>
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  yearsBox: { marginTop: Spacing.two },
});
