import { ApiError } from '@/lib/api/errors';

/** How many times a failed query is tried again, so at most four requests in all. */
export const MAX_RETRIES = 3;

/**
 * TanStack Query's retry rule for every query: try again only when trying again could help.
 *
 * - **No answer** (`network_error`, `timeout`) or **a server fault** (HTTP 5xx, which includes
 *   `auth_unavailable`): retry. These pass by themselves. Query waits between tries with its
 *   default backoff (1 s, 2 s, 4 s, ... up to 30 s), so a struggling server isn't hammered.
 * - **A 4xx answer**: never. The server understood and refused, so the same request gets the same
 *   answer. That includes a `token_expired` that reached us here: the API client already
 *   refreshed once, and repeating the request can't fix a refused refresh.
 * - **An answer we can't read** (`unexpected_response` with a 2xx status) and **errors that aren't
 *   ApiErrors** (bugs, a missing .env): never. They are the same every time.
 *
 * It doesn't decide about signing out. The API client does that, and never for `auth_unavailable`.
 */
export function shouldRetry(failureCount: number, error: Error): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!(error instanceof ApiError)) return false;
  return error.status === null || error.status >= 500;
}
