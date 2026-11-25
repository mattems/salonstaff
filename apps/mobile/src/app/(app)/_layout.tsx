import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const nudged = useRef(false);
  const needsProfile = !!user && !user.profile;

  // Onboarding nudge: new seekers set up their profile, then verification.
  useEffect(() => {
    if (nudged.current || !needsProfile) return;
    nudged.current = true;
    router.push({ pathname: '/edit-profile', params: { onboarding: '1' } });
  }, [needsProfile, router]);

  // Signing out: render nothing while the auth guard redirects, so screens that
  // rely on `useUser()` never render without a user.
  if (!user) return null;

  return (
    <Stack
      screenOptions={{
        headerTintColor: theme.brand,
        // An explicit background keeps the header opaque on iOS 26 (no content under it).
        headerStyle: { backgroundColor: theme.background },
        headerShadowVisible: false,
        headerTitleStyle: { color: theme.text },
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="jobs/[id]" options={{ title: '' }} />
      <Stack.Screen
        name="apply/[id]"
        options={{ presentation: 'modal', title: 'Apply' }}
      />
      <Stack.Screen name="edit-profile" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="verification" options={{ title: 'Verification centre' }} />
      <Stack.Screen name="verify-complete" options={{ headerShown: false }} />
    </Stack>
  );
}
