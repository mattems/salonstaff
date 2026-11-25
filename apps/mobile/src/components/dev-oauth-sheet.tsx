import { z } from 'zod';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { OAuthProvider } from '@/lib/api';

const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: 'Google', apple: 'Apple' };

/**
 * __DEV__ only: stands in for the native Google / Apple sheet when the provider isn't configured
 * on this client. The dev server accepts `idToken: "mock:<email>:<name>"`.
 */
export function DevOAuthSheet({
  provider,
  onClose,
  onSubmit,
}: {
  provider: OAuthProvider | null;
  onClose: () => void;
  onSubmit: (provider: OAuthProvider, idToken: string, name: string) => Promise<void>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!provider) return;
    const parsed = z.email().safeParse(email.trim().toLowerCase());
    if (!parsed.success) {
      setError('Enter a valid email');
      return;
    }
    const cleanName = name.replace(/:/g, ' ').trim();
    setError(null);
    setBusy(true);
    try {
      await onSubmit(provider, `mock:${parsed.data}:${cleanName}`, cleanName);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={!!provider} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, paddingBottom: insets.bottom + Spacing.four },
          ]}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text variant="overline" color="warning">
                Development only
              </Text>
              <Text variant="heading">Mock {provider ? PROVIDER_LABEL[provider] : ''} sign-in</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          <Text variant="small" color="textSecondary">
            {provider ? PROVIDER_LABEL[provider] : 'This provider'} isn’t configured in this build, so
            we’ll send a mock ID token that the dev server accepts.
          </Text>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="sam@example.com"
            error={error}
          />
          <TextField label="Name" value={name} onChangeText={setName} placeholder="Sam Taylor" />
          <Button title="Continue" onPress={submit} loading={busy} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.five,
    gap: Spacing.four,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
});
