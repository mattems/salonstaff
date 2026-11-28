import { type ProfilePart, profileStrength } from '@salonstaff/shared';
import type { Href } from 'expo-router';

import type { IconName } from '@/components/icon';
import type { MyProfile } from '@/lib/api';

/** What to do about each missing part, and the screen that does it. */
const TODO: Record<ProfilePart, { action: string; href: Href; icon: IconName }> = {
  basics: { action: 'Add your basics', href: '/edit-profile', icon: 'edit' },
  portfolio: { action: 'Add 3 photos of your work', href: '/profile/portfolio', icon: 'photos' },
  photo: { action: 'Add a photo of you', href: '/profile/photo', icon: 'camera' },
  about: { action: 'Write a headline and a few words about you', href: '/edit-profile', icon: 'edit' },
  skills: { action: 'Add your specialties', href: '/profile/skills', icon: 'sparkles' },
  experience: { action: 'Add where you’ve worked', href: '/profile/experience', icon: 'jobs' },
  identity: { action: 'Verify your identity', href: '/verification', icon: 'shield' },
  availability: { action: 'Say when you can work', href: '/profile/availability', icon: 'calendar' },
  pay: { action: 'Say what pay you’re after', href: '/profile/availability', icon: 'pay' },
  endorsement: { action: 'Ask for an endorsement', href: '/profile/endorsements', icon: 'quote' },
};

export type ProfileTodo = { part: ProfilePart; points: number } & (typeof TODO)[ProfilePart];

/**
 * How complete their profile is (the shared rule the website uses too, D-24), and what to do next,
 * most valuable first.
 */
export function strengthOfMyProfile(full: MyProfile): { score: number; todo: ProfileTodo[] } {
  const { score, missing } = profileStrength({
    ...full.profile,
    portfolio: full.portfolio.length,
    experience: full.experience.length,
    endorsements: full.endorsements.length,
    identityVerified: full.verification.identity === 'verified',
  });
  return { score, todo: missing.map((m) => ({ part: m.part, points: m.points, ...TODO[m.part] })) };
}

/** Below this, the app keeps suggesting they finish their profile (Jobs, applying). */
export const STRONG_PROFILE = 70;
