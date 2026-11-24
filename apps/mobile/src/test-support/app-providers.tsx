// The app's providers wired to fakes, for tests that render screens.
import type { Session } from '@supabase/supabase-js';
import type { ReactNode } from 'react';

import type { ApiClient } from '@/lib/api/client';
import { ApiProvider } from '@/lib/api/provider';
import { SessionProvider, type SessionAuth } from '@/lib/auth/session';
import { createQueryClient } from '@/lib/query/client';
import { QueryProvider } from '@/lib/query/provider';

export const sessionOf = (id: string) =>
  ({ access_token: 'a', refresh_token: 'r', user: { id } }) as unknown as Session;

/** An API whose /v1/me answers with `signedInAs.id`, or fails with the replies queued before it. */
export function fakeApi(replies: (Error | 'ok')[] = [], signedInAs = { id: 'alice' }) {
  const request = jest.fn(async (_path: string, _options?: unknown) => {
    const reply = replies.shift() ?? 'ok';
    if (reply !== 'ok') throw reply;
    return { id: signedInAs.id };
  });
  return { client: { request } as unknown as ApiClient, request, signedInAs };
}

const clients: ReturnType<typeof createQueryClient>[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

export function TestProviders({ auth, api, children }: { auth: SessionAuth; api: ApiClient; children: ReactNode }) {
  // One client per render of the root would drop the cache, so tests render this once.
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    queries: {
      ...queryClient.getDefaultOptions().queries,
      retryDelay: 0, // waiting a second between tries would only slow the tests down
      gcTime: Infinity, // no five-minute garbage-collection timer to hold the test run open
    },
  });
  clients.push(queryClient);
  return (
    <SessionProvider auth={auth} appState={null}>
      <ApiProvider client={api}>
        <QueryProvider client={queryClient} appState={null}>
          {children}
        </QueryProvider>
      </ApiProvider>
    </SessionProvider>
  );
}
