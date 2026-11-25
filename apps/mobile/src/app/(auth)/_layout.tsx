import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export const unstable_settings = { anchor: 'sign-in' };

export default function AuthLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTitle: '',
        headerTransparent: true,
        headerTintColor: theme.brand,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="verify-code" options={{ headerBackTitle: 'Back' }} />
    </Stack>
  );
}
