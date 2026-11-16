import { ApiError, errorFromBody, NETWORK_ERROR, UNEXPECTED_RESPONSE } from './errors';

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
};

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

  async function call(path: string, token: string, options: RequestOptions): Promise<HttpResponse> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      return await send(`${baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch (error) {
      // A cancelled request is the caller's decision, not a failure, so it passes through as is.
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new ApiError(null, NETWORK_ERROR, 'The API could not be reached.');
    }
  }

  async function readSuccess<T>(response: HttpResponse): Promise<T> {
    const text = await response.text();
    if (text === '') return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(response.status, UNEXPECTED_RESPONSE, 'The response was not valid JSON.');
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
      const response = await call(path, token, options);
      if (response.ok) return readSuccess<T>(response);

      const error = errorFromBody(response.status, await response.text());
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
