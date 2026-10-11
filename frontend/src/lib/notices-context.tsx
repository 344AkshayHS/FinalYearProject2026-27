// The bell's state for every screen: its messages (lib/notices.ts) and which of them the farmer has already seen.
// Seen messages are remembered on this device, so a message read once does not light the bell again.

import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { buildNotices, type Notice } from '@/lib/notices';
import type { PastResult } from '@/lib/past-results';

// Enough for every message that can be on the list at once; older ids are forgotten
const SEEN_KEPT = 40;

type NoticesState = {
  notices: Notice[];
  seen: string[];
  markSeen: (ids: string[]) => void;
  refresh: () => void; // check the past results and today's date again (the bell page does it when it opens)
  results: PastResult[] | null; // the farmer's past results (the feedback page shows the one it is about)
};

const NoticesContext = createContext<NoticesState | null>(null);

export function NoticesProvider({ children }: { children: ReactNode }) {
  const { token, language, forecast } = useApp();
  // The past results, with the login they belong to: after logging in as someone else the old ones are not used
  const [loaded, setLoaded] = useState<{ token: string; results: PastResult[] } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [seen, setSeen] = useState<string[]>([]);
  const [seenLoaded, setSeenLoaded] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync('seenNotices')
      .then((text) => {
        const ids: unknown = JSON.parse(text ?? '[]');
        if (Array.isArray(ids)) {
          const saved = ids.filter((id): id is string => typeof id === 'string');
          setSeen((old) => [...old, ...saved.filter((id) => !old.includes(id))].slice(0, SEEN_KEPT));
        }
      })
      .catch(() => {}) // nothing saved yet, or unreadable: every message counts as new
      .finally(() => setSeenLoaded(true));
  }, []);

  useEffect(() => {
    if (seenLoaded) {
      SecureStore.setItemAsync('seenNotices', JSON.stringify(seen)).catch(() => {});
    }
  }, [seen, seenLoaded]);

  useEffect(() => {
    if (!token) {
      return;
    }
    let current = true;
    api<{ recommendations: PastResult[] }>('/users/me/recommendations', { token })
      .then((data) => current && setLoaded({ token, results: data.recommendations }))
      .catch(() => {}); // not loaded: no feedback message this time
    return () => {
      current = false;
    };
  }, [token, attempt]);

  const results = loaded && loaded.token === token ? loaded.results : null;

  // Both stay the same function between draws, so the bell page can run them from an effect without a loop.
  // markSeen keeps the list unchanged when every id is already in it, so calling it again draws nothing new.
  const markSeen = useCallback((ids: string[]) => {
    setSeen((old) => (ids.every((id) => old.includes(id)) ? old : [...ids.filter((id) => !old.includes(id)), ...old].slice(0, SEEN_KEPT)));
  }, []);
  const refresh = useCallback(() => {
    setNow(new Date());
    setAttempt((n) => n + 1);
  }, []);

  return (
    <NoticesContext
      value={{
        notices: buildNotices({ now, language, forecast, results }),
        seen,
        markSeen,
        refresh,
        results,
      }}>
      {children}
    </NoticesContext>
  );
}

export function useNotices() {
  const state = use(NoticesContext);
  if (!state) {
    throw new Error('useNotices must be used inside <NoticesProvider>');
  }
  return state;
}
