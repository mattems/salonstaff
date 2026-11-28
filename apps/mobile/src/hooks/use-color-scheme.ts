import { useSyncExternalStore } from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';

import { appearanceStore } from '@/lib/appearance';

/**
 * Light or dark: the choice in Settings, or the phone's own when it's "Match the phone". Follows
 * the choice at once, so the app's colours change together with iOS's (see `appearanceStore`).
 */
export function useColorScheme(): 'light' | 'dark' {
  const choice = useSyncExternalStore(appearanceStore.subscribe, appearanceStore.get);
  const system = useSystemScheme();
  if (choice !== 'system') return choice;
  return system === 'dark' ? 'dark' : 'light';
}
