import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/api';

type RequestState<T> = {
  data: T | undefined;
  error: string | null;
  /** First load (no data yet). */
  loading: boolean;
  /** Pull-to-refresh in progress. */
  refreshing: boolean;
};

type Options = {
  /** Refetch when this changes. */
  key?: unknown;
  /** Load whenever the screen gains focus (instead of only on mount). */
  refetchOnFocus?: boolean;
};

/**
 * Minimal data-fetching hook: loads on mount (or on every focus), exposes
 * `reload()` for silent refetches and `refresh()` for pull-to-refresh.
 */
export function useRequest<T>(fetcher: () => Promise<T>, { key = null, refetchOnFocus = false }: Options = {}) {
  const [state, setState] = useState<RequestState<T>>({
    data: undefined,
    error: null,
    loading: true,
    refreshing: false,
  });
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const seq = useRef(0);

  const run = useCallback(async (mode: 'load' | 'reload' | 'refresh') => {
    const id = ++seq.current;
    setState((s) => ({
      ...s,
      loading: mode === 'load' && s.data === undefined,
      refreshing: mode === 'refresh',
      error: mode === 'reload' ? s.error : null,
    }));
    try {
      const data = await fetcherRef.current();
      if (id === seq.current) setState({ data, error: null, loading: false, refreshing: false });
    } catch (err) {
      if (id === seq.current)
        setState((s) => ({ ...s, error: errorMessage(err), loading: false, refreshing: false }));
    }
  }, []);

  useEffect(() => {
    if (!refetchOnFocus) void run('load');
  }, [run, key, refetchOnFocus]);

  useFocusEffect(
    useCallback(() => {
      if (refetchOnFocus) void run('load');
    }, [run, refetchOnFocus]),
  );

  const reload = useCallback(() => run('reload'), [run]);
  const refresh = useCallback(() => run('refresh'), [run]);
  const setData = useCallback(
    (updater: (prev: T | undefined) => T | undefined) =>
      setState((s) => ({ ...s, data: updater(s.data) })),
    [],
  );

  return { ...state, reload, refresh, setData };
}
