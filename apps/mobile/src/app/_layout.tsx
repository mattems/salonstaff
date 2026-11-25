import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

function navigationTheme(dark: boolean): Theme {
  const base = dark ? DarkTheme : DefaultTheme;
  const c = Colors[dark ? 'dark' : 'light'];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.brand,
      background: c.background,
      card: c.surface,
      text: c.text,
      border: c.border,
      notification: c.brand,
    },
  };
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return (
    <ThemeProvider value={navigationTheme(dark)}>
      <AuthProvider>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hide();
  }, [status]);

  if (status === 'loading') return null; // splash stays up

  if (status === 'unreachable') return <UnreachableScreen />;

  const signedIn = status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn} redirectTo="/sign-in">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo="/">
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

function UnreachableScreen() {
  const { unreachableMessage, retry, signOut } = useAuth();
  const theme = useTheme();
  return (
    <View style={[styles.unreachable, { backgroundColor: theme.background }]}>
      <Icon name="error" size={36} color={theme.brand} />
      <Text variant="heading" style={styles.center}>
        Can’t load your account
      </Text>
      <Text color="textSecondary" style={styles.center}>
        {unreachableMessage}
      </Text>
      <Button title="Try again" onPress={retry} style={styles.button} />
      <Button title="Sign out" variant="ghost" onPress={() => signOut()} />
    </View>
  );
}

const styles = StyleSheet.create({
  unreachable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.six,
    gap: Spacing.three,
  },
  center: { textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: Spacing.four },
});
