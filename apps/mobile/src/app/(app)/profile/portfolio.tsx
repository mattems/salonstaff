import { PROFILE_LIMITS } from '@salonstaff/shared';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ImageViewer } from '@/components/image-viewer';
import { profileSection } from '@/components/needs-profile';
import { PortfolioGrid } from '@/components/portfolio-grid';
import { Screen } from '@/components/screen';
import { ErrorBanner, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { useMyProfile } from '@/hooks/use-my-profile';
import { api, errorMessage, type PortfolioItem, type UploadFile } from '@/lib/api';
import { pickImage } from '@/lib/pick-image';

export default profileSection(PortfolioScreen);

function PortfolioScreen() {
  const { data, error, loading, refreshing, reload, refresh, setData } = useMyProfile();
  const [viewing, setViewing] = useState<number | null>(null);
  const [picked, setPicked] = useState<UploadFile | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;
  const items = data.portfolio;
  const full = items.length >= PROFILE_LIMITS.portfolio;

  function setItems(next: PortfolioItem[]) {
    setData((prev) => (prev ? { ...prev, portfolio: next } : prev));
  }

  async function choose() {
    setProblem(null);
    try {
      setPicked(await pickImage());
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  async function add() {
    if (!picked) return;
    setProblem(null);
    setBusy(true);
    try {
      const item = await api.addPortfolioPhoto(picked, caption);
      setItems([...items, item]);
      setPicked(null);
      setCaption('');
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(index: number) {
    const item = items[index];
    if (!item) return;
    Alert.alert('Remove this photo?', item.caption ?? undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setItems((await api.removePortfolioPhoto(item.id)).portfolio);
          } catch (err) {
            Alert.alert('Couldn’t remove it', errorMessage(err));
          }
        },
      },
    ]);
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Text variant="small" color="textSecondary">
        Photos of your work, up to {PROFILE_LIMITS.portfolio}. {items.length} so far. Tap one to
        see it, hold one to remove it.
      </Text>
      {items.length ? (
        <PortfolioGrid items={items} onPressItem={setViewing} onLongPressItem={confirmRemove} />
      ) : null}
      {full ? null : (
        <Card>
          <Text variant="subheading">Add a photo</Text>
          {picked ? (
            <View style={styles.form}>
              <Text variant="small" numberOfLines={1}>
                {picked.name}
              </Text>
              <TextField
                label="Caption (optional)"
                value={caption}
                onChangeText={setCaption}
                maxLength={140}
                placeholder="e.g. Lived-in blonde, two sessions"
              />
              <Button title="Add photo" icon="addPhoto" onPress={add} loading={busy} />
              <Button
                title="Choose another"
                variant="ghost"
                size="sm"
                disabled={busy}
                onPress={choose}
              />
            </View>
          ) : (
            <Button title="Choose a photo" icon="photos" variant="secondary" onPress={choose} />
          )}
          <ErrorBanner message={problem} />
        </Card>
      )}
      <ImageViewer items={items} index={viewing} onClose={() => setViewing(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
});
