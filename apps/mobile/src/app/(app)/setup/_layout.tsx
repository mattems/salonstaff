import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { SetupProvider } from '@/lib/setup';

/** Setting up a new job seeker (D-24): its own stack of one-question screens, sharing a draft. */
export default function SetupLayout() {
  const theme = useTheme();
  return (
    <SetupProvider>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}
      />
    </SetupProvider>
  );
}
