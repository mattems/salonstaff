/**
 * Setting up a new job seeker (D-24): one question per screen after their first code, gathered here
 * and saved as their profile once the required ones are answered (at work rights). Photo,
 * notifications and Face ID follow, each one skippable; then "You're in", which points them at
 * finishing their profile.
 */
import {
  type AuState,
  type JobRole,
  type RightToWork,
  seekerProfileSchema,
} from '@salonstaff/shared';
import { type Href, useRouter } from 'expo-router';
import { createContext, type PropsWithChildren, use, useCallback, useMemo, useState } from 'react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBiometricLock } from '@/lib/biometric-lock';
import { pushAvailable } from '@/lib/push-notifications';

export type SetupStep = 'name' | 'work' | 'where' | 'rights' | 'photo' | 'notifications' | 'face-id';

const ALL_STEPS: SetupStep[] = ['name', 'work', 'where', 'rights', 'photo', 'notifications', 'face-id'];

const HREFS: Record<SetupStep, Href> = {
  name: '/setup/name',
  work: '/setup/work',
  where: '/setup/where',
  rights: '/setup/rights',
  photo: '/setup/photo',
  notifications: '/setup/notifications',
  'face-id': '/setup/face-id',
};

export type SetupDraft = {
  firstName: string;
  lastName: string;
  roles: JobRole[];
  yearsExperience: number;
  suburb: string;
  postcode: string;
  state: AuState | undefined;
  /** How far they'd travel, in km (saved with their details). */
  travelKm: number | undefined;
  rightToWork: RightToWork | undefined;
};

type SetupContextValue = {
  draft: SetupDraft;
  update: (changes: Partial<SetupDraft>) => void;
  /** The steps this phone shows (no notifications or Face ID where it can't have them). */
  steps: SetupStep[];
  /** On to the step after this one, or to "You're in" after the last. */
  next: (from: SetupStep) => void;
  /** Saves the profile from the draft (and how far they'd travel). Throws what the API says. */
  saveProfile: () => Promise<void>;
};

/**
 * The account's name when it's a person's (Apple and Google give one), not the email or number an
 * account made by code may carry instead.
 */
function givenName(name: string | undefined): string {
  const n = name?.trim() ?? '';
  return /[@\d]/.test(n) ? '' : n;
}

const SetupContext = createContext<SetupContextValue | null>(null);

export function useSetup(): SetupContextValue {
  const value = use(SetupContext);
  if (!value) throw new Error('useSetup must be used inside <SetupProvider>');
  return value;
}

export function SetupProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { kind } = useBiometricLock();
  const [draft, setDraft] = useState<SetupDraft>(() => {
    const [first = '', ...rest] = givenName(user?.name).split(' ');
    return {
      firstName: user?.profile?.firstName ?? first,
      lastName: user?.profile?.lastName ?? rest.join(' '),
      roles: user?.profile?.roles ?? [],
      yearsExperience: user?.profile?.yearsExperience ?? 0,
      suburb: user?.profile?.suburb ?? '',
      postcode: user?.profile?.postcode ?? '',
      state: user?.profile?.state,
      travelKm: undefined,
      rightToWork: user?.profile?.rightToWork,
    };
  });

  const steps = useMemo(
    () =>
      ALL_STEPS.filter(
        (s) => (s !== 'notifications' || pushAvailable) && (s !== 'face-id' || kind !== null),
      ),
    [kind],
  );

  const update = useCallback(
    (changes: Partial<SetupDraft>) => setDraft((d) => ({ ...d, ...changes })),
    [],
  );

  const next = useCallback(
    (from: SetupStep) => {
      const after = steps[steps.indexOf(from) + 1];
      // Done: how complete their profile is, and the push to finish it.
      router.push(after ? HREFS[after] : '/setup/done');
    },
    [steps, router],
  );

  const saveProfile = useCallback(async () => {
    const input = seekerProfileSchema.parse({
      firstName: draft.firstName,
      lastName: draft.lastName,
      suburb: draft.suburb,
      state: draft.state,
      postcode: draft.postcode,
      roles: draft.roles,
      yearsExperience: draft.yearsExperience,
      rightToWork: draft.rightToWork,
      openToWork: true,
    });
    await api.saveProfile(input);
    if (draft.travelKm !== undefined) await api.saveDetails({ travelKm: draft.travelKm });
    await refresh();
  }, [draft, refresh]);

  const value = useMemo<SetupContextValue>(
    () => ({ draft, update, steps, next, saveProfile }),
    [draft, update, steps, next, saveProfile],
  );
  return <SetupContext value={value}>{children}</SetupContext>;
}
