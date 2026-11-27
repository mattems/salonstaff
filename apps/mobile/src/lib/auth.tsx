import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  api,
  ApiProblem,
  setApiToken,
  setUnauthorizedHandler,
  type CodeTarget,
  type Me,
  type OAuthProvider,
} from '@/lib/api';
import { tokenStore } from '@/lib/token-store';

const TOKEN_KEY = 'salonstaff.session-token';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  /** We have a stored token but couldn't load the account (e.g. offline at launch). */
  | { status: 'unreachable'; token: string; message: string }
  | { status: 'signedIn'; token: string; user: Me };

type AuthContextValue = {
  status: AuthState['status'];
  /** Only non-null while signed in. */
  user: Me | null;
  unreachableMessage: string | null;
  sendCode: (target: CodeTarget) => Promise<void>;
  verifyCode: (target: CodeTarget, code: string) => Promise<Me>;
  /** Native Google / Apple sign-in: the provider's ID token becomes a session. */
  signInWithOAuth: (provider: OAuthProvider, idToken: string, name?: string) => Promise<Me>;
  /** Local development only: the demo job seeker, without a code. */
  devLogin: () => Promise<Me>;
  /** Re-fetch `/v1/me` (e.g. after a profile update or verification). */
  refresh: () => Promise<Me | null>;
  /** Ends the session. Pass `{ revoke: false }` when the token is already invalid. */
  signOut: (opts?: { revoke?: boolean }) => Promise<void>;
  /** Retry loading the account after an `unreachable` launch. */
  retry: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** For screens inside the signed-in group, where `user` is guaranteed. */
export function useUser(): Me {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called while signed out');
  return user;
}

async function clearStoredToken() {
  setApiToken(null);
  try {
    await tokenStore.remove(TOKEN_KEY);
  } catch {
    // Nothing we can do; the token is already dropped from memory.
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const loadAccount = useCallback(async (token: string) => {
    setApiToken(token);
    try {
      const user = await api.me(token);
      setState({ status: 'signedIn', token, user });
    } catch (err) {
      if (err instanceof ApiProblem && err.status === 401) {
        await clearStoredToken();
        setState({ status: 'signedOut' });
      } else {
        const message = err instanceof ApiProblem ? err.message : 'Could not load your account.';
        setState({ status: 'unreachable', token, message });
      }
    }
  }, []);

  // Restore the session on launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let token: string | null = null;
      try {
        token = await tokenStore.get(TOKEN_KEY);
      } catch {
        token = null;
      }
      if (cancelled) return;
      if (token) await loadAccount(token);
      else setState({ status: 'signedOut' });
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAccount]);

  // Any 401 from an authenticated call ends the session.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearStoredToken();
      setState({ status: 'signedOut' });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const sendCode = useCallback((target: CodeTarget) => api.sendCode(target), []);

  /** A new session token: keep it, then load the account with it. */
  const startSession = useCallback(async (token: string) => {
    const user = await api.me(token);
    await tokenStore.set(TOKEN_KEY, token);
    setApiToken(token);
    setState({ status: 'signedIn', token, user });
    return user;
  }, []);

  const verifyCode = useCallback(
    async (target: CodeTarget, code: string) => startSession(await api.verifyCode(target, code)),
    [startSession],
  );

  const signInWithOAuth = useCallback(
    async (provider: OAuthProvider, idToken: string, name?: string) =>
      startSession(await api.signInWithIdToken(provider, idToken, name)),
    [startSession],
  );

  const devLogin = useCallback(async () => startSession(await api.devLogin()), [startSession]);

  const refresh = useCallback(async () => {
    try {
      const user = await api.me();
      setState((prev) =>
        prev.status === 'signedIn' || prev.status === 'unreachable'
          ? { status: 'signedIn', token: prev.token, user }
          : prev,
      );
      return user;
    } catch {
      return null;
    }
  }, []);

  const signOut = useCallback(async ({ revoke = true }: { revoke?: boolean } = {}) => {
    // Best effort: end the session on the server, but never block signing out on it.
    // (The token is read as the call starts, before it's cleared below.)
    if (revoke) api.signOut().catch(() => {});
    await clearStoredToken();
    setState({ status: 'signedOut' });
  }, []);

  const retry = useCallback(async () => {
    if (state.status !== 'unreachable') return;
    setState({ status: 'loading' });
    await loadAccount(state.token);
  }, [state, loadAccount]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.status === 'signedIn' ? state.user : null,
      unreachableMessage: state.status === 'unreachable' ? state.message : null,
      sendCode,
      verifyCode,
      signInWithOAuth,
      devLogin,
      refresh,
      signOut,
      retry,
    }),
    [state, sendCode, verifyCode, signInWithOAuth, devLogin, refresh, signOut, retry],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
