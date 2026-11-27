import {
  LIVE_TIMING,
  type LiveConnection,
  type LiveSide,
  openLive,
} from '@salonstaff/shared';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { liveSocket, type ApplicationMessage } from '@/lib/api';

/**
 * Keeps a conversation live while its screen is open and the app is in front (D-18): new
 * messages and "typing…" arrive over a WebSocket. In the background the socket closes, so the
 * other side's messages come by push as usual; back in front, it reconnects and `onReconnect`
 * reads the conversation again.
 */
export function useLiveConversation(
  path: string | undefined,
  me: LiveSide,
  handlers: { onMessage(message: ApplicationMessage): void; onReconnect(): void },
) {
  const [typing, setTyping] = useState<string | null>(null);
  const live = useRef<LiveConnection | null>(null);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!path) return;
    let hideTyping: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      live.current ??= openLive<ApplicationMessage>(() => liveSocket(path), {
        onMessage(message) {
          if (message.from !== me) setTyping(null);
          latest.current.onMessage(message);
        },
        onTyping(name, from) {
          if (from === me) return;
          setTyping(name);
          clearTimeout(hideTyping);
          hideTyping = setTimeout(() => setTyping(null), LIVE_TIMING.typingShownForMs);
        },
        onReconnect: () => latest.current.onReconnect(),
      });
    };
    const stop = () => {
      live.current?.close();
      live.current = null;
      setTyping(null);
    };
    start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return stop();
      start();
      latest.current.onReconnect();
    });
    return () => {
      subscription.remove();
      clearTimeout(hideTyping);
      stop();
    };
  }, [path, me]);

  return { typing, live };
}
