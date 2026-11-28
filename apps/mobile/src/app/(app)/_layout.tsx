import { useLastNotificationResponse } from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useFreshInbox } from '@/hooks/use-fresh-inbox';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useMode } from '@/lib/mode';
import { destinationOf, pushWanted, registerForPush } from '@/lib/push-notifications';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  const theme = useTheme();
  const { user, refresh } = useAuth();
  const { mode, setMode, refreshSalons } = useMode();
  const router = useRouter();
  const segments = useSegments();
  const settingUp = (segments as string[]).includes('setup');
  const nudged = useRef(false);
  const salonSide = mode === 'salon';
  const needsProfile = !!user && !user.profile && !salonSide;

  // A new job seeker sets up their profile, one question at a time (D-24). Not on the salon side
  // (D-20): a salon's team needs no profile.
  useEffect(() => {
    if (nudged.current || !needsProfile) return;
    nudged.current = true;
    router.push('/setup/name');
  }, [needsProfile, router]);

  // Push notifications (D-15): once there's a profile, or on the salon side, send this phone's token;
  // again on each launch, as tokens change. It asks permission first, unless they said "Not now"
  // while setting up. Not during setup, which asks with its own screen.
  const hasProfile = !!user?.profile || salonSide;
  const [pushReachesPhone, setPushReachesPhone] = useState<boolean | null>(null);
  useEffect(() => {
    if (!hasProfile || settingUp) return;
    pushWanted()
      .then((ask) => registerForPush({ ask }))
      .then(setPushReachesPhone)
      .catch((error: unknown) => {
        setPushReachesPhone(false);
        // Pushes are a bonus: every notice also goes by email.
        if (__DEV__) console.warn('Push notifications not set up:', error);
      });
  }, [hasProfile, settingUp]);

  // Keep the Inbox badge (or on the salon side, the Messages badge) current, without a socket.
  const refreshBadges = useCallback(
    () => (salonSide ? Promise.all([refresh(), refreshSalons()]) : refresh()),
    [salonSide, refresh, refreshSalons],
  );
  useFreshInbox(refreshBadges, pushReachesPhone);

  // A tapped push opens its screen (also when it launched the app).
  const response = useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!response || !user) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const destination = destinationOf(response);
    if (!destination) return;
    if ('screen' in destination) {
      // A salon's notice (a new applicant, a reply) shows on the salon side.
      if (destination.side === 'salon' && !salonSide && user.salons.length) void setMode('salon');
      router.push(destination.screen);
    } else WebBrowser.openBrowserAsync(destination.web);
  }, [response, user, router, salonSide, setMode]);

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
      <Stack.Screen
        name="setup"
        options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      <Stack.Screen name="edit-profile" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="verification" options={{ title: 'Verification centre' }} />
      <Stack.Screen name="profile/photo" options={{ title: 'Photo' }} />
      <Stack.Screen name="profile/skills" options={{ title: 'Skills' }} />
      <Stack.Screen name="profile/availability" options={{ title: 'Availability and pay' }} />
      <Stack.Screen name="profile/portfolio" options={{ title: 'Portfolio' }} />
      <Stack.Screen name="profile/experience" options={{ title: 'Experience' }} />
      <Stack.Screen name="profile/endorsements" options={{ title: 'Endorsements' }} />
      <Stack.Screen name="profile/sharing" options={{ title: 'Visibility and sharing' }} />
      <Stack.Screen name="profile/contact" options={{ title: 'How salons contact you' }} />
      <Stack.Screen name="profile/security" options={{ title: 'Sign-in and security' }} />
      <Stack.Screen name="inbox/[id]" options={{ title: '' }} />
      <Stack.Screen name="applications/[id]" options={{ title: '' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="hire/job/[salonId]/[id]" options={{ title: '' }} />
      <Stack.Screen name="hire/application/[salonId]/[id]" options={{ title: '' }} />
      <Stack.Screen name="hire/candidate/[salonId]/[userId]" options={{ title: '' }} />
      <Stack.Screen name="hire/conversation/[salonId]/[userId]" options={{ title: '' }} />
      <Stack.Screen name="verify-complete" options={{ headerShown: false }} />
    </Stack>
  );
}
