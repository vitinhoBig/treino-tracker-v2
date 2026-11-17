import { ApiError, errorFromBody, NETWORK_ERROR, TIMEOUT, UNEXPECTED_RESPONSE } from './errors';

/** The parts of a fetch response the client uses. Narrow on purpose, so tests can fake it. */
export type HttpResponse = { ok: boolean; status: number; text(): Promise<string> };
export type HttpFetch = (url: string, init: RequestInit) => Promise<HttpResponse>;

export type ApiClientDependencies = {
  baseUrl: string;
  /** The current access token, or null when nobody is signed in. */
  getAccessToken: () => Promise<string | null>;
  /** Refreshes the session and returns the new access token, or null if that failed. */
  refreshSession: () => Promise<string | null>;
  /** Signs out on this device only. The token is bad, so there's no point telling the server. */
  signOut: () => Promise<void>;
  fetch?: HttpFetch;
  sleep?: (milliseconds: number) => Promise<void>;
  /** How many times to retry `auth_unavailable`. The waits double each time, from backoffMs. */
  unavailableRetries?: number;
  backoffMs?: number;
  /** How long one request may take, from sending it to reading the whole answer. */
  timeoutMs?: number;
};

/** One request's answer, with the body already read inside the timeout. */
type Exchange = { ok: boolean; status: number; text: string };

export const DEFAULT_TIMEOUT_MS = 15_000;

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

export type ApiClient = {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
};

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Calls our FastAPI service with the user's access token and handles the auth error codes from
 * docs/API_AUTH.md:
 *
 * - `token_expired`: refresh the session once, retry once, and sign out if either fails
 * - `invalid_token` and `missing_token`: sign out, no retry
 * - `auth_unavailable`: retry a few times with growing waits, and never sign out
 * - anything else, including `anonymous_user`: throw it for the screen to show
 *
 * Every request has a timeout, because neither fetch in React Native has one: a phone that drops
 * to a dead connection would otherwise wait for the operating system, which can take minutes. A
 * request that runs out of time fails with `timeout`. This client doesn't retry it, since a
 * retry rule belongs to the caller (the query layer), which knows whether the request is safe to repeat.
 *
 * Nothing here logs. The token goes only into the Authorization header.
 */
export function createApiClient(dependencies: ApiClientDependencies): ApiClient {
  const {
    baseUrl,
    getAccessToken,
    refreshSession,
    signOut,
    fetch: send = fetch as HttpFetch,
    sleep = defaultSleep,
    unavailableRetries = 2,
    backoffMs = 500,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = dependencies;

  // Several requests can find the token expired at the same moment. They share one refresh, because
  // a refresh token can be used once: a second refresh with the same one would fail and sign the
  // user out for no reason.
  let refreshInFlight: Promise<string | null> | null = null;
  function refreshOnce(): Promise<string | null> {
    refreshInFlight ??= refreshSession()
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
    return refreshInFlight;
  }

  /**
   * Sends one request and reads the whole answer, all inside the timeout.
   *
   * Why the failure is judged by state, not by the error's name: Expo's fetch throws a plain
   * `fetch failed` error for a request cancelled before it started and passes the abort reason on
   * for one cancelled later, so neither reliably arrives as an `AbortError`.
   */
  async function exchange(path: string, token: string, options: RequestOptions): Promise<Exchange> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    // One controller for both reasons to stop: the caller cancelling and the time running out.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const cancel = () => controller.abort();
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener('abort', cancel);

    try {
      const response = await send(`${baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      return { ok: response.ok, status: response.status, text: await response.text() };
    } catch (error) {
      // A cancelled request is the caller's decision, not a failure, so it passes through as one.
      if (options.signal?.aborted) {
        throw error instanceof Error && error.name === 'AbortError'
          ? error
          : Object.assign(new Error('The request was cancelled.'), { name: 'AbortError' });
      }
      if (timedOut) throw new ApiError(null, TIMEOUT, 'The API took too long to answer.');
      throw new ApiError(null, NETWORK_ERROR, 'The API could not be reached.');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  }

  function readSuccess<T>(reply: Exchange): T {
    if (reply.text === '') return undefined as T;
    try {
      return JSON.parse(reply.text) as T;
    } catch {
      throw new ApiError(reply.status, UNEXPECTED_RESPONSE, 'The response was not valid JSON.');
    }
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let token = await getAccessToken();
    if (!token) {
      await signOut();
      throw new ApiError(401, 'missing_token', 'Not signed in.');
    }

    let refreshed = false;
    let unavailableAttempts = 0;
    for (;;) {
      const reply = await exchange(path, token, options);
      if (reply.ok) return readSuccess<T>(reply);

      const error = errorFromBody(reply.status, reply.text);
      switch (error.code) {
        case 'token_expired': {
          const fresh = refreshed ? null : await refreshOnce();
          refreshed = true;
          if (!fresh) {
            await signOut();
            throw error;
          }
          token = fresh;
          continue;
        }
        case 'invalid_token':
        case 'missing_token':
          await signOut();
          throw error;
        case 'auth_unavailable':
          if (unavailableAttempts < unavailableRetries) {
            await sleep(backoffMs * 2 ** unavailableAttempts);
            unavailableAttempts += 1;
            continue;
          }
          throw error;
        default:
          throw error;
      }
    }
  }

  return { request };
}
