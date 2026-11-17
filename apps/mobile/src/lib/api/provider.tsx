// The app's API client, wired to the real session.
import { createContext, use, useMemo, type ReactNode } from 'react';

import { useSession } from '@/lib/auth/session';
import { getConfig } from '@/lib/config';

import { createApiClient, type ApiClient } from './client';

const ApiContext = createContext<ApiClient | null>(null);

type Props = {
  children: ReactNode;
  /** Defaults to a client for the app's own API. Tests pass a fake. */
  client?: ApiClient;
};

export function ApiProvider({ children, client }: Props) {
  const { getAccessToken, refreshSession, signOut } = useSession();

  // These three keep their identity across auth events (see SessionProvider), so the client is
  // built once.
  const api = useMemo<ApiClient>(() => {
    if (client) return client;
    let real: ApiClient | undefined;
    return {
      // Built on the first request, never while rendering: reading the config throws when there is
      // no .env, and `expo export` renders pages in Node without one (CI has none).
      request: (path, options) =>
        (real ??= createApiClient({
          baseUrl: getConfig().apiUrl,
          getAccessToken,
          refreshSession,
          signOut,
          // The query layer retries (see lib/query/retry.ts). Retrying here as well would multiply
          // the tries, and this loop's waits can't be cancelled when a screen closes.
          unavailableRetries: 0,
        })).request(path, options),
    };
  }, [client, getAccessToken, refreshSession, signOut]);

  return <ApiContext value={api}>{children}</ApiContext>;
}

export function useApi(): ApiClient {
  const value = use(ApiContext);
  if (value === null) throw new Error('useApi must be used inside <ApiProvider>.');
  return value;
}
