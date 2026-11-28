import { AU_STATES, SEARCH_RADII_KM, stateOfPostcode } from '@salonstaff/shared';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { SetupScreen } from '@/components/setup-screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { useSetup } from '@/lib/setup';

/** Step 3: where they live (the state follows the postcode) and how far they'd travel. */
export default function SetupWhereScreen() {
  const { draft, update, next } = useSetup();
  const ready = draft.suburb.trim() !== '' && /^\d{4}$/.test(draft.postcode) && !!draft.state;

  function setPostcode(text: string) {
    const postcode = text.replace(/\D/g, '').slice(0, 4);
    const state = stateOfPostcode(postcode);
    update(state ? { postcode, state } : { postcode });
  }

  return (
    <SetupScreen
      step="where"
      title="Where are you based?"
      subtitle="We’ll show you jobs nearby. Salons see your suburb, never your address."
      footer={<Button title="Continue" disabled={!ready} onPress={() => next('where')} />}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <TextField
            label="Suburb"
            value={draft.suburb}
            onChangeText={(suburb) => update({ suburb })}
            autoFocus
            autoComplete="postal-address-locality"
            textContentType="addressCity"
            maxLength={80}
          />
        </View>
        <View style={styles.postcode}>
          <TextField
            label="Postcode"
            value={draft.postcode}
            onChangeText={setPostcode}
            keyboardType="number-pad"
            autoComplete="postal-code"
            textContentType="postalCode"
            maxLength={4}
          />
        </View>
      </View>

      <View style={styles.group}>
        <Text variant="smallStrong" color="textSecondary">
          State
        </Text>
        <View style={styles.chips}>
          {AU_STATES.map((s) => (
            <Chip
              key={s.value}
              label={s.value}
              selected={draft.state === s.value}
              onPress={() => update({ state: s.value })}
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <Text variant="smallStrong" color="textSecondary">
          How far would you travel? <Text variant="small" color="textMuted">(optional)</Text>
        </Text>
        <View style={styles.chips}>
          {SEARCH_RADII_KM.map((km) => (
            <Chip
              key={km}
              label={`${km} km`}
              selected={draft.travelKm === km}
              onPress={() => update({ travelKm: draft.travelKm === km ? undefined : km })}
            />
          ))}
        </View>
      </View>
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.three },
  grow: { flex: 2 },
  postcode: { flex: 1 },
  group: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
