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

function apply(choice: AppearanceChoice) {
  Appearance.setColorScheme(choice === 'system' ? 'auto' : choice);
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
