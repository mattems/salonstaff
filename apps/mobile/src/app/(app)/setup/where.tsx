import { type AuState, SEARCH_RADII_KM } from '@salonstaff/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { SetupScreen } from '@/components/setup-screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiProblem, api, errorMessage } from '@/lib/api';
import { useSetup } from '@/lib/setup';

type Place = { suburb: string; state: AuState };

/**
 * Step 3: their postcode, and nothing else to type. Its suburb (and state) come from it; a postcode
 * covering several suburbs asks which. Then how far they'd travel.
 */
export default function SetupWhereScreen() {
  const theme = useTheme();
  const { draft, update, next } = useSetup();
  /** What the last postcode looked up found: its suburbs, or why there aren't any. */
  const [found, setFound] = useState<{ postcode: string; places?: Place[]; problem?: string }>();
  const complete = /^\d{4}$/.test(draft.postcode);
  const current = complete && found?.postcode === draft.postcode ? found : undefined;
  const looking = complete && !current;
  const places = current?.places ?? null;
  const problem = current?.problem ?? null;
  const ready = complete && !!draft.suburb && !!draft.state;

  // A whole postcode: its suburbs. Just one is chosen for them.
  useEffect(() => {
    if (!complete) return;
    const postcode = draft.postcode;
    let alive = true;
    api
      .suburbsIn(postcode)
      .then(({ suburbs }) => {
        if (!alive) return;
        setFound({ postcode, places: suburbs });
        const only = suburbs.length === 1 ? suburbs[0] : undefined;
        if (only) update({ suburb: only.suburb, state: only.state });
        // Several to pick from: out of the keyboard's way.
        else Keyboard.dismiss();
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setFound({
          postcode,
          problem:
            err instanceof ApiProblem && err.status === 404
              ? 'We don’t know that postcode. Check it’s where you live, not a PO box.'
              : errorMessage(err),
        });
      });
    return () => {
      alive = false;
    };
  }, [complete, draft.postcode, update]);

  function setPostcode(text: string) {
    const postcode = text.replace(/\D/g, '').slice(0, 4);
    if (postcode === draft.postcode) return;
    // A different postcode: its suburb has to be found again.
    update({ postcode, suburb: '', state: undefined });
  }

  const several = places && places.length > 1 ? places : null;

  return (
    <SetupScreen
      step="where"
      title="What’s your postcode?"
      subtitle="We’ll show you jobs nearby. Salons see your suburb, never your address."
      footer={<Button title="Continue" disabled={!ready} onPress={() => next('where')} />}>
      <TextField
        label="Postcode"
        value={draft.postcode}
        onChangeText={setPostcode}
        autoFocus
        keyboardType="number-pad"
        autoComplete="postal-code"
        textContentType="postalCode"
        maxLength={4}
        placeholder="3065"
        error={problem}
        style={styles.postcode}
      />

      {looking ? <ActivityIndicator color={theme.brand} style={styles.start} /> : null}

      {!looking && places?.length === 1 && draft.suburb ? (
        <View style={styles.place}>
          <Icon name="location" size={18} color={theme.brand} />
          <Text variant="bodyStrong">
            {draft.suburb}, {draft.state}
          </Text>
        </View>
      ) : null}

      {!looking && several ? (
        <View style={styles.group}>
          <Text variant="smallStrong" color="textSecondary">
            Which suburb?
          </Text>
          <View style={styles.chips}>
            {several.map((p) => (
              <Chip
                key={`${p.suburb}-${p.state}`}
                label={several.some((o) => o.state !== p.state) ? `${p.suburb}, ${p.state}` : p.suburb}
                selected={draft.suburb === p.suburb && draft.state === p.state}
                onPress={() => update({ suburb: p.suburb, state: p.state })}
              />
            ))}
          </View>
        </View>
      ) : null}

      {ready ? (
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
      ) : null}
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  // No extra letter spacing: iOS doesn't give it to the placeholder, so the two wouldn't match.
  postcode: { fontSize: 24, fontWeight: '600', height: 60 },
  start: { alignSelf: 'flex-start' },
  place: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  group: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
