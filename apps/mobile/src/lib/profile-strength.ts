import type { FullProfile } from '@salonstaff/shared';
import type { Href } from 'expo-router';

import type { IconName } from '@/components/icon';

export type StrengthItem = {
  key: string;
  label: string;
  done: boolean;
  href: Href;
  icon: IconName;
};

/** The checklist behind the "Profile strength" meter. */
export function profileStrength(full: FullProfile): { items: StrengthItem[]; percent: number } {
  const p = full.profile;
  const items: StrengthItem[] = [
    { key: 'photo', label: 'Add a profile photo', done: !!p.photoUrl, href: '/edit/photo', icon: 'camera' },
    {
      key: 'about',
      label: 'Write a headline and about you',
      done: !!p.headline?.trim() && !!p.about?.trim(),
      href: '/edit-profile',
      icon: 'edit',
    },
    {
      key: 'specialties',
      label: 'Pick 3 or more specialties',
      done: p.specialties.length >= 3,
      href: '/edit/details',
      icon: 'sparkles',
    },
    {
      key: 'portfolio',
      label: 'Show 3+ photos of your work',
      done: full.portfolio.length >= 3,
      href: '/edit/portfolio',
      icon: 'photos',
    },
    {
      key: 'experience',
      label: 'Add your experience',
      done: full.experience.length > 0,
      href: '/edit/experience',
      icon: 'jobs',
    },
    {
      key: 'availability',
      label: 'Set your availability',
      done: p.availableDays.length > 0,
      href: '/edit/details',
      icon: 'calendar',
    },
    {
      key: 'identity',
      label: 'Verify your identity',
      done: full.verification.identity === 'verified',
      href: '/verification',
      icon: 'shield',
    },
  ];
  const done = items.filter((i) => i.done).length;
  return { items, percent: Math.round((done / items.length) * 100) };
}
