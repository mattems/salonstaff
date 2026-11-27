import * as WebBrowser from 'expo-web-browser';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { useRequest } from '@/hooks/use-request';
import { api, errorMessage, type ProfileContact } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { siteUrl } from '@/lib/config';
import { formatDate } from '@/lib/format';

/** One salon's message, or that they looked at your number. Opening it marks it seen. */
export default function InboxItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useRequest(api.contacts);
  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  const item = data?.items.find((i) => i.id === id);
  if (!item) return <ErrorView message="This message is no longer in your inbox." />;
  return <Opened item={item} onChange={reload} />;
}

function Opened({ item, onChange }: { item: ProfileContact; onChange: () => Promise<void> }) {
  const { refresh: refreshMe } = useAuth();
  const [hiding, setHiding] = useState(false);
  const marked = useRef(false);

  useEffect(() => {
    if (item.read || marked.current) return;
    marked.current = true;
    api
      .markRead([item.id])
      .then(() => refreshMe())
      .catch(() => {});
  }, [item, refreshMe]);

  const openSalon = () => WebBrowser.openBrowserAsync(siteUrl(item.salon.path));

  function hide() {
    Alert.alert(
      `Hide from ${item.salon.name}?`,
      'They won’t be able to see or contact you, unless you apply to one of their jobs.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide',
          style: 'destructive',
          onPress: async () => {
            setHiding(true);
            try {
              await api.hideFromSalon(item.salon.id);
              await onChange();
            } catch (err) {
              Alert.alert('Couldn’t hide your profile', errorMessage(err));
            } finally {
              setHiding(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: item.salon.name }} />
      <Card>
        <Text variant="heading">{item.salon.name}</Text>
        <Text variant="small" color="textSecondary">
          {item.kind === 'message'
            ? `${item.sender?.name || 'Someone'} sent you a message · ${formatDate(item.createdAt)}`
            : `Looked at your number · ${formatDate(item.createdAt)}`}
        </Text>
        {item.kind === 'message' ? (
          <Text selectable>{item.message}</Text>
        ) : (
          <Text variant="small">
            They may call or text you. Want to know more about them first? Look at their salon’s
            page.
          </Text>
        )}
      </Card>
      {item.kind === 'message' && item.sender ? (
        <>
          <Button
            title="Reply by email"
            icon="mail"
            onPress={() =>
              Linking.openURL(
                `mailto:${item.sender?.email}?subject=${encodeURIComponent('Re: your message on Salon Staff')}`,
              )
            }
          />
          <Text variant="caption" color="textMuted" style={styles.center}>
            We also emailed you this message: replying to that email reaches{' '}
            {item.sender.name || 'them'} too.
          </Text>
        </>
      ) : null}
      <Button title="See their salon" variant="outline" onPress={openSalon} />
      {item.hidden ? (
        <Text variant="small" color="textMuted" style={styles.center}>
          You’ve hidden your profile from them.
        </Text>
      ) : (
        <Button title={`Hide from ${item.salon.name}`} variant="ghost" loading={hiding} onPress={hide} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
