// TanStack Query for the whole app: the cache, the foreground signal and the sign-out cleanup.
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { platformAppState } from '@/lib/auth/app-state';
import type { AppStateLike } from '@/lib/auth/auto-refresh';
import { useSession } from '@/lib/auth/session';

import { createQueryClient } from './client';
import { bindFocusManager } from './focus';

type Props = {
  children: ReactNode;
  /** Defaults to a new client. Tests pass their own. */
  client?: QueryClient;
  /** Defaults to React Native's AppState on iOS and Android, and none on web. */
  appState?: AppStateLike | null;
};

export function QueryProvider({ children, client, appState }: Props) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  const { status, session } = useSession();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    const states = appState === undefined ? platformAppState() : appState;
    return states ? bindFocusManager(focusManager, states) : undefined;
  }, [appState]);

  // The cache holds one person's data, so it must not outlive their session. Without this, signing
  // out and then in as someone else on the same phone would briefly show the first person's
  // workouts and weight. Keys carry the user id too, but the id is the second line of defence:
  // clearing also frees the memory. It cancels what is still loading as well, since removing a
  // query destroys it.
  //
  // It runs only when leaving a real user, never when someone signs in after a sign-out (the cache
  // is already empty by then). It is a layout effect so it runs before the screens' own effects
  // start the next person's requests, which a plain effect would not guarantee: React runs child
  // effects first.
  const owner = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (status === 'loading') return;
    const previous = owner.current;
    if (typeof previous === 'string' && previous !== userId) queryClient.clear();
    owner.current = userId;
  }, [status, userId, queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
