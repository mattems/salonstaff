import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/**
 * One tab's own stack, so the tab keeps a title bar under the native tab bar (which has none).
 * Screens opened from a tab (a job, a message) sit above the tabs in the signed-in stack.
 */
export function TabStack({ screen, title }: { screen: string; title: string }) {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerShadowVisible: false,
        headerTitleStyle: { color: theme.text, fontWeight: '700' },
        headerTintColor: theme.brand,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name={screen} options={{ title }} />
    </Stack>
  );
}
