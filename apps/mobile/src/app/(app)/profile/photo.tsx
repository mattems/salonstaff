import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { profileSection } from '@/components/needs-profile';
import { ProfilePhoto } from '@/components/profile-photo';
import { Screen } from '@/components/screen';
import { ErrorBanner, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { useMyProfile } from '@/hooks/use-my-profile';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pickImage } from '@/lib/pick-image';

export default profileSection(PhotoScreen);

function PhotoScreen() {
  const { data, error, loading, reload, setData } = useMyProfile();
  const { refresh: refreshMe } = useAuth();
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;
  const p = data.profile;

  function setPhoto(photoUrl: string | null) {
    setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, photoUrl } } : prev));
    void refreshMe();
  }

  async function choose() {
    setProblem(null);
    try {
      const file = await pickImage({ square: true });
      if (!file) return;
      setBusy('upload');
      setPhoto((await api.uploadPhoto(file)).photoUrl);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setProblem(null);
    setBusy('remove');
    try {
      setPhoto((await api.removePhoto()).photoUrl);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Card style={styles.card}>
        <ProfilePhoto photoUrl={p.photoUrl} firstName={p.firstName} lastName={p.lastName} size={144} />
        <Text variant="small" color="textSecondary" style={styles.center}>
          A clear, friendly photo of you. It’s also the picture when you share your profile. JPG,
          PNG, WebP or HEIC, up to 8MB.
        </Text>
        <ErrorBanner message={problem} />
        <View style={styles.buttons}>
          <Button
            title={p.photoUrl ? 'Choose a new photo' : 'Choose a photo'}
            icon="camera"
            loading={busy === 'upload'}
            disabled={busy !== null}
            onPress={choose}
          />
          {p.photoUrl ? (
            <Button
              title="Remove"
              variant="ghost"
              loading={busy === 'remove'}
              disabled={busy !== null}
              onPress={remove}
            />
          ) : null}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center' },
  center: { textAlign: 'center' },
  buttons: { alignSelf: 'stretch', gap: 8 },
});
