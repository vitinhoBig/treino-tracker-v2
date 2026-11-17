import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/lib/auth/session';

import { useApi } from './provider';

/** The answer of GET /v1/me: who the API says is calling, taken from the verified token. */
export type Me = { id: string };

// The user id is part of the key, so one person's cached answer can never be handed to another.
export const meKey = (userId: string | null) => ['me', userId] as const;

/** Who the API says is signed in. Waits until there is a session, and refetches with it. */
export function useMe() {
  const api = useApi();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  return useQuery({
    queryKey: meKey(userId),
    // The query's signal cancels the request when the screen goes away.
    queryFn: ({ signal }) => api.request<Me>('/v1/me', { signal }),
    enabled: userId !== null,
  });
}
