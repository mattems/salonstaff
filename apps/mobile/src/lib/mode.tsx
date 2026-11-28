/**
 * Which side of the app is showing (D-20): a job seeker's (jobs, applications, inbox, profile) or
 * a salon's (its jobs, applicants and messages across every salon you're on). Someone on a salon's
 * team starts on the salon side and can switch in Settings; the choice is kept on this phone.
 * The salon side also keeps your salons (with their unread counts) for its Messages badge.
 */
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api, type Schemas } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { tokenStore } from '@/lib/token-store';

export type AppMode = 'seeker' | 'salon';
export type MySalon = Schemas['MySalonWithInbox'];

const KEY = 'salonstaff.mode';

type ModeContextValue = {
  mode: AppMode;
  /** On a salon's team: the salon side is there to switch to. */
  canUseSalon: boolean;
  setMode: (mode: AppMode) => Promise<void>;
  /** Your salons, on the salon side (empty until loaded). */
  salons: MySalon[];
  /** Conversations with messages your salons' teams haven't read. */
  salonUnread: number;
  refreshSalons: () => Promise<void>;
};

const ModeContext = createContext<ModeContextValue | null>(null);

export function useMode(): ModeContextValue {
  const value = use(ModeContext);
  if (!value) throw new Error('useMode must be used inside <ModeProvider>');
  return value;
}

export function ModeProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [saved, setSaved] = useState<AppMode | null | undefined>(undefined);
  const [salons, setSalons] = useState<MySalon[]>([]);

  useEffect(() => {
    tokenStore
      .get(KEY)
      .then((value) => setSaved(value === 'salon' || value === 'seeker' ? value : null))
      .catch(() => setSaved(null));
  }, []);

  const canUseSalon = (user?.salons.length ?? 0) > 0;
  // Unchosen: a salon's team starts on the salon side. Nobody without a salon sees it.
  const mode: AppMode = !canUseSalon
    ? 'seeker'
    : (saved ?? (user?.role === 'employer' ? 'salon' : 'seeker'));

  const setMode = useCallback(async (next: AppMode) => {
    setSaved(next);
    await tokenStore.set(KEY, next).catch(() => {});
  }, []);

  const refreshSalons = useCallback(async () => {
    try {
      setSalons((await api.salon.salons()).items);
    } catch {
      // Kept as they were; the next refresh tries again.
    }
  }, []);

  // Loaded on the salon side, again for someone else signing in.
  const userId = user?.id;
  useEffect(() => {
    if (mode !== 'salon' || !userId) return;
    let current = true;
    api.salon
      .salons()
      .then((result) => current && setSalons(result.items))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [mode, userId]);
  const shown = useMemo(() => (userId ? salons : []), [userId, salons]);

  const value = useMemo<ModeContextValue>(
    () => ({
      mode,
      canUseSalon,
      setMode,
      salons: shown,
      salonUnread: shown.reduce((sum, s) => sum + s.unreadMessages, 0),
      refreshSalons,
    }),
    [mode, canUseSalon, setMode, shown, refreshSalons],
  );

  // Wait for the saved choice, so the wrong side never flashes up.
  if (saved === undefined) return null;
  return <ModeContext value={value}>{children}</ModeContext>;
}
