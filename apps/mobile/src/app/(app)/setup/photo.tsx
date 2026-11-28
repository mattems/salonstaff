import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ProfilePhoto } from '@/components/profile-photo';
import { SetupScreen } from '@/components/setup-screen';
import { ErrorBanner } from '@/components/state-views';
import { Spacing } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pickImage } from '@/lib/pick-image';
import { useSetup } from '@/lib/setup';

/** Step 5: a photo of them (their profile exists by now). Skippable. */
export default function SetupPhotoScreen() {
  const { draft, next } = useSetup();
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoUrl = user?.profile?.photoUrl ?? null;

  async function choose() {
    setError(null);
    try {
      const file = await pickImage({ square: true });
      if (!file) return;
      setBusy(true);
      await api.uploadPhoto(file);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SetupScreen
      step="photo"
      title="Add a photo of you"
      subtitle="Profiles with a clear, friendly photo get more replies from salons."
      footer={
        photoUrl ? (
          <>
            <Button title="Continue" onPress={() => next('photo')} />
            <Button title="Choose a different photo" variant="ghost" loading={busy} onPress={choose} />
          </>
        ) : (
          <>
            <Button title="Choose a photo" icon="camera" loading={busy} onPress={choose} />
            <Button title="Skip for now" variant="ghost" onPress={() => next('photo')} />
          </>
        )
      }>
      <View style={styles.photo}>
        <ProfilePhoto
          photoUrl={photoUrl}
          firstName={draft.firstName}
          lastName={draft.lastName}
          size={168}
        />
      </View>
      <ErrorBanner message={error} />
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  photo: { alignItems: 'center', paddingVertical: Spacing.five },
});
