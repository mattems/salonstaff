import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import type { Href } from 'expo-router';
import { Platform } from 'react-native';

import { api } from '@/lib/api';
import { SITE_URL } from '@/lib/config';

/**
 * Pushes come straight from Apple to this app (D-15), so they need a development or release build:
 * Expo Go is a different app, with its own token.
 */
export const pushAvailable =
  Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

if (pushAvailable) {
  // Show a push that arrives while the app is open, too.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Asks once (iOS only ever shows its prompt the first time), then sends this phone's token to the
 * API. Run on every launch while signed in: the token can change. Signing out stops the pushes,
 * since the API ties the phone to the session.
 */
export async function registerForPush(): Promise<void> {
  if (!pushAvailable) return;
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return;
  const { data: token } = await Notifications.getDevicePushTokenAsync();
  // Development builds (and the simulator, which says null) use Apple's sandbox.
  const environment = await Application.getIosPushNotificationServiceEnvironmentAsync().catch(
    () => null,
  );
  await api.registerPushDevice({
    platform: 'ios',
    token: String(token),
    sandbox: environment !== 'production',
  });
}

/** The website pages notices link to, and the app's screen for each. */
const SCREENS: Record<string, Href> = {
  '/applications': '/applications',
  '/inbox': '/inbox',
  '/account/endorsements': '/profile/endorsements',
  '/account/verify': '/verification',
};

/**
 * Where a tapped push goes: the app's own screen for the website link it carries, or the website
 * itself for anything the app doesn't have (a salon's pages, say).
 */
export function destinationOf(
  response: Notifications.NotificationResponse,
): { screen: Href } | { web: string } | null {
  const url = response.notification.request.content.data?.url;
  if (typeof url !== 'string') return null;
  try {
    const { pathname, search } = new URL(url);
    const screen = SCREENS[pathname.replace(/\/+$/, '') || '/'];
    if (screen) return { screen };
    return { web: new URL(pathname + search, SITE_URL).toString() };
  } catch {
    return null;
  }
}
