import { RIGHT_TO_WORK } from '@salonstaff/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { SetupScreen } from '@/components/setup-screen';
import { ErrorBanner } from '@/components/state-views';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { useSetup } from '@/lib/setup';

/**
 * Step 4: their right to work in Australia (D-08's declaration). The last thing a profile needs, so
 * continuing saves it.
 */
export default function SetupRightsScreen() {
  const theme = useTheme();
  const { draft, update, next, saveProfile } = useSetup();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await saveProfile();
      next('rights');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SetupScreen
      step="rights"
      title="Can you work in Australia?"
      subtitle="Salons see this, and some jobs need full work rights. You can have it checked later for a badge."
      footer={
        <>
          <ErrorBanner message={error} />
          <Button
            title="Save and continue"
            disabled={!draft.rightToWork}
            loading={saving}
            onPress={save}
          />
        </>
      }>
      <View
        accessibilityRole="radiogroup"
        style={[styles.list, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {RIGHT_TO_WORK.map((opt, i) => {
          const selected = draft.rightToWork === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => update({ rightToWork: opt.value })}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
                pressed && { opacity: 0.7 },
              ]}>
              <View style={[styles.radio, { borderColor: selected ? theme.brand : theme.border }]}>
                {selected ? <View style={[styles.dot, { backgroundColor: theme.brand }]} /> : null}
              </View>
              <Text style={styles.flex}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
