import { addNotificationReceivedListener } from 'expo-notifications';
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { api } from '@/lib/api';
import { pushAvailable, pushesAllowed } from '@/lib/push-notifications';

/** The tabs, by path: switching to one re-checks the Inbox count. */
const TABS = new Set([
  '/',
  '/saved',
  '/applications',
  '/inbox',
  '/profile',
  // The salon side's (D-20).
  '/hiring',
  '/applicants',
  '/messages',
  '/salon',
]);
/** Tab switches re-check at most this often. */
const TAB_GAP_MS = 10_000;
/** How often to re-check while the app is open, when message pushes don't reach this phone. */
const POLL_MS = 15_000;

/**
 * Keeps the Inbox badge current without a socket. A push about a message re-checks it at once; so
 * do coming back to the app and switching tabs. When pushes about messages won't reach this phone
 * (turned off in Settings or on the phone, or the API can't send them, as locally), it also
 * re-checks every 15 seconds while the app is open.
 *
 * `pushReachesPhone` is what registering this phone for pushes said, or null before it has.
 */
export function useFreshInbox(refresh: () => Promise<unknown>, pushReachesPhone: boolean | null) {
  const pathname = usePathname();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [messagePushes, setMessagePushes] = useState<boolean | null>(null);
  const lastCheck = useRef(0);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  const check = useCallback(() => {
    lastCheck.current = Date.now();
    void refreshRef.current();
  }, []);

  // Do message pushes reach this phone? Their setting (in the app) and the phone's permission.
  const readSettings = useCallback(() => {
    void messagePushesOn().then(setMessagePushes);
  }, []);

  // Back in the app: re-check, and read the settings again (they may have changed in iOS Settings).
  useEffect(() => {
    readSettings();
    const sub = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
      if (state !== 'active') return;
      check();
      readSettings();
    });
    const received = pushAvailable ? addNotificationReceivedListener(check) : null;
    return () => {
      sub.remove();
      received?.remove();
    };
  }, [check, readSettings]);

  // Switching tabs re-checks; leaving Settings reads the settings again.
  const previous = useRef(pathname);
  useEffect(() => {
    const was = previous.current;
    previous.current = pathname;
    if (was === pathname) return;
    if (was === '/settings') readSettings();
    if (TABS.has(pathname) && Date.now() - lastCheck.current > TAB_GAP_MS) check();
  }, [pathname, check, readSettings]);

  // No pushes about messages: every 15 seconds while the app is open.
  const pushes = pushReachesPhone === true && messagePushes === true;
  useEffect(() => {
    if (!active || pushes) return;
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [active, pushes, check]);
}

async function messagePushesOn(): Promise<boolean> {
  try {
    const [prefs, allowed] = await Promise.all([api.notificationPreferences(), pushesAllowed()]);
    return prefs.messages.push && allowed;
  } catch {
    return false;
  }
}
