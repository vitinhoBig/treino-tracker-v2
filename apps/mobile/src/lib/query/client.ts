import { QueryClient } from '@tanstack/react-query';

import { shouldRetry } from './retry';

/** One QueryClient holds the cache for the whole app. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        // Data younger than this is shown as is when a screen opens or the app comes back to the
        // foreground, with no request. Older data is shown at once and refreshed behind it.
        staleTime: 60_000,
      },
      // Mutations are not retried by default, and stay that way: whether a write is safe to
      // repeat is decided per write (workout and set ids come from the client, so those are).
    },
  });
}
