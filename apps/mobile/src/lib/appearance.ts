import { Appearance } from 'react-native';

import { tokenStore } from '@/lib/token-store';

/** Light, dark, or whatever the phone is set to. Kept on this phone only. */
export type AppearanceChoice = 'system' | 'light' | 'dark';

export const APPEARANCE_CHOICES: { value: AppearanceChoice; label: string; description: string }[] = [
  { value: 'system', label: 'Match the phone', description: 'Light or dark, as your phone is set.' },
  { value: 'light', label: 'Light', description: 'Always light.' },
  { value: 'dark', label: 'Dark', description: 'Always dark.' },
];

const KEY = 'salonstaff.appearance';

/**
 * The choice as the app's own colours see it (`useColorScheme`). They follow this straight away,
 * in the same moment iOS repaints its parts (headers, tab bar), rather than waiting for React
 * Native to hear about the change, which left the app a beat behind.
 */
let current: AppearanceChoice = 'system';
const listeners = new Set<() => void>();
export const appearanceStore = {
  get: () => current,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function apply(choice: AppearanceChoice) {
  Appearance.setColorScheme(choice === 'system' ? 'auto' : choice);
  current = choice;
  for (const listener of listeners) listener();
}

export async function savedAppearance(): Promise<AppearanceChoice> {
  try {
    const value = await tokenStore.get(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** Applies the saved choice. Run once at launch, before the first screen shows. */
export async function restoreAppearance(): Promise<void> {
  const choice = await savedAppearance();
  if (choice !== 'system') apply(choice);
}

export async function setAppearance(choice: AppearanceChoice): Promise<void> {
  apply(choice);
  await tokenStore.set(KEY, choice);
}
