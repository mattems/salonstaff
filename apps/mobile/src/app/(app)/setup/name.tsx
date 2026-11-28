import { type ComponentRef, useRef } from 'react';
import { StyleSheet, type TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { SetupScreen } from '@/components/setup-screen';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { useSetup } from '@/lib/setup';

/** Step 1: their name, as salons will see it. */
export default function SetupNameScreen() {
  const { draft, update, next } = useSetup();
  const last = useRef<ComponentRef<typeof TextInput>>(null);
  const ready = draft.firstName.trim() !== '' && draft.lastName.trim() !== '';

  return (
    <SetupScreen
      step="name"
      title="What’s your name?"
      subtitle="Salons see it on your profile and when you apply."
      footer={<Button title="Continue" disabled={!ready} onPress={() => next('name')} />}>
      <View style={styles.fields}>
        <TextField
          label="First name"
          value={draft.firstName}
          onChangeText={(firstName) => update({ firstName })}
          autoFocus
          autoComplete="given-name"
          textContentType="givenName"
          returnKeyType="next"
          maxLength={60}
          onSubmitEditing={() => last.current?.focus()}
        />
        <TextField
          ref={last}
          label="Last name"
          value={draft.lastName}
          onChangeText={(lastName) => update({ lastName })}
          autoComplete="family-name"
          textContentType="familyName"
          returnKeyType="next"
          maxLength={60}
          onSubmitEditing={() => ready && next('name')}
        />
      </View>
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: Spacing.four },
});
