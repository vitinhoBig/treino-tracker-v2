import { createApiClient, type HttpResponse } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';

const TOKEN = 'header.payload.old-signature';
const FRESH = 'header.payload.fresh-signature';
const USER = { id: '11111111-2222-4333-8444-555555555555' };

type Reply = { status: number; body?: unknown; raw?: string } | Error;

const json = (status: number, body: unknown): Reply => ({ status, body });
const apiError = (status: number, code: string, message = code): Reply =>
  json(status, { error: { code, message } });

/** A fake server that answers with the given replies in order, and records every request. */
function setup(replies: Reply[], { token = TOKEN as string | null, fresh = FRESH as string | null } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = jest.fn(async (url: string, init: RequestInit): Promise<HttpResponse> => {
    calls.push({ url, init });
    const reply = replies.shift();
    if (!reply) throw new Error('No reply left for this request');
    if (reply instanceof Error) throw reply;
    const text = reply.raw ?? (reply.body === undefined ? '' : JSON.stringify(reply.body));
    return { ok: reply.status < 400, status: reply.status, text: async () => text };
  });
  const deps = {
    getAccessToken: jest.fn(async () => token),
    refreshSession: jest.fn(async () => fresh),
    signOut: jest.fn(async () => {}),
    sleep: jest.fn(async (_ms: number) => {}),
  };
  const client = createApiClient({ baseUrl: 'http://api.test', fetch, ...deps });
  const authOf = (i: number) => (calls[i].init.headers as Record<string, string>).Authorization;
  return { client, fetch, calls, authOf, ...deps };
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('Expected the request to fail');
}

describe('successful requests', () => {
  it('sends the access token to the API and returns the parsed body', async () => {
    const { client, calls, authOf } = setup([json(200, USER)]);

    await expect(client.request('/v1/me')).resolves.toEqual(USER);
    expect(calls[0].url).toBe('http://api.test/v1/me');
    expect(calls[0].init.method).toBe('GET');
    expect(authOf(0)).toBe(`Bearer ${TOKEN}`);
  });

  it('sends a body as JSON', async () => {
    const { client, calls } = setup([json(201, { ok: true })]);

    await client.request('/v1/things', { method: 'POST', body: { reps: 5 } });

    expect(calls[0].init.body).toBe('{"reps":5}');
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('returns undefined for an empty body', async () => {
    const { client } = setup([{ status: 204 }]);

    await expect(client.request('/v1/things')).resolves.toBeUndefined();
  });
});

describe('not signed in', () => {
  it('does not call the API without a token, and treats the user as signed out', async () => {
    const { client, fetch, signOut } = setup([], { token: null });

    const error = await failure(client.request('/v1/me'));

    expect(error.code).toBe('missing_token');
    expect(fetch).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out when the server says the token is missing', async () => {
    const { client, signOut, refreshSession } = setup([apiError(401, 'missing_token')]);

    expect((await failure(client.request('/v1/me'))).code).toBe('missing_token');
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe('token_expired', () => {
  it('refreshes once and retries once with the new token', async () => {
    const { client, fetch, authOf, refreshSession, signOut } = setup([
      apiError(401, 'token_expired'),
      json(200, USER),
    ]);

    await expect(client.request('/v1/me')).resolves.toEqual(USER);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(authOf(1)).toBe(`Bearer ${FRESH}`);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs out instead of looping when the retry is also expired', async () => {
    const { client, fetch, refreshSession, signOut } = setup([
      apiError(401, 'token_expired'),
      apiError(401, 'token_expired'),
    ]);

    expect((await failure(client.request('/v1/me'))).code).toBe('token_expired');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out when the refresh fails', async () => {
    const { client, fetch, signOut } = setup([apiError(401, 'token_expired')], { fresh: null });

    expect((await failure(client.request('/v1/me'))).code).toBe('token_expired');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out when the refresh throws', async () => {
    const { client, refreshSession, signOut } = setup([apiError(401, 'token_expired')]);
    refreshSession.mockRejectedValueOnce(new Error('refresh endpoint down'));

    expect((await failure(client.request('/v1/me'))).code).toBe('token_expired');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out when the retried request has an invalid token', async () => {
    const { client, signOut } = setup([apiError(401, 'token_expired'), apiError(401, 'invalid_token')]);

    expect((await failure(client.request('/v1/me'))).code).toBe('invalid_token');
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('invalid_token', () => {
  it('signs out without retrying or refreshing', async () => {
    const { client, fetch, refreshSession, signOut } = setup([apiError(401, 'invalid_token')]);

    const error = await failure(client.request('/v1/me'));

    expect(error).toMatchObject({ status: 401, code: 'invalid_token' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('anonymous_user', () => {
  it('throws for the screen to handle, without signing out or retrying', async () => {
    const { client, fetch, signOut } = setup([apiError(403, 'anonymous_user')]);

    expect(await failure(client.request('/v1/me'))).toMatchObject({ status: 403, code: 'anonymous_user' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('auth_unavailable', () => {
  it('waits and retries, then succeeds', async () => {
    const { client, sleep, signOut } = setup([apiError(503, 'auth_unavailable'), json(200, USER)]);

    await expect(client.request('/v1/me')).resolves.toEqual(USER);
    expect(sleep.mock.calls).toEqual([[500]]);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('gives up after a bounded number of retries with growing waits, and never signs out', async () => {
    const { client, fetch, sleep, signOut } = setup([
      apiError(503, 'auth_unavailable'),
      apiError(503, 'auth_unavailable'),
      apiError(503, 'auth_unavailable'),
    ]);

    expect((await failure(client.request('/v1/me'))).code).toBe('auth_unavailable');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[500], [1000]]);
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('failures outside our error format', () => {
  it('reports a network failure with its own code and no status', async () => {
    const { client, signOut } = setup([new TypeError('Network request failed')]);

    expect(await failure(client.request('/v1/me'))).toMatchObject({ status: null, code: 'network_error' });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('lets a cancelled request through as a cancellation', async () => {
    const abort = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    const { client } = setup([abort]);

    await expect(client.request('/v1/me')).rejects.toBe(abort);
  });

  it('reports an HTML error page from a proxy as unexpected_response, keeping the status', async () => {
    const { client } = setup([{ status: 502, raw: '<html>Bad Gateway</html>' }]);

    expect(await failure(client.request('/v1/me'))).toMatchObject({
      status: 502,
      code: 'unexpected_response',
    });
  });

  it('reports JSON in some other shape as unexpected_response', async () => {
    const { client } = setup([json(500, { detail: 'Internal Server Error' })]);

    expect((await failure(client.request('/v1/me'))).code).toBe('unexpected_response');
  });

  it('reports a success body that is not JSON as unexpected_response', async () => {
    const { client } = setup([{ status: 200, raw: 'not json' }]);

    expect(await failure(client.request('/v1/me'))).toMatchObject({
      status: 200,
      code: 'unexpected_response',
    });
  });
});

describe('other API errors', () => {
  it('pass through with their code, message and details', async () => {
    const details = [{ field: 'query.limit', message: 'Input should be a valid integer' }];
    const { client, signOut } = setup([
      json(422, { error: { code: 'validation_error', message: 'The request is invalid.', details } }),
    ]);

    const error = await failure(client.request('/v1/things'));

    expect(error).toMatchObject({ status: 422, code: 'validation_error', message: 'The request is invalid.' });
    expect(error.details).toEqual(details);
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('the token stays secret', () => {
  it('never appears in a log line or in an error', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => {}),
    );
    const flows: Reply[][] = [
      [apiError(401, 'invalid_token')],
      [apiError(401, 'token_expired'), apiError(401, 'token_expired')],
      [new TypeError('Network request failed')],
      [{ status: 502, raw: '<html>Bad Gateway</html>' }],
    ];

    for (const replies of flows) {
      const error = await failure(setup(replies).client.request('/v1/me'));
      const visible = `${error.message} ${JSON.stringify(error)} ${String(error.stack)}`;
      expect(visible).not.toContain(TOKEN);
      expect(visible).not.toContain(FRESH);
    }
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});

describe('parallel token_expired', () => {
  it('shares ONE refresh between two simultaneous requests', async () => {
    const { client, refreshSession, authOf } = setup([
      apiError(401, 'token_expired'),
      apiError(401, 'token_expired'),
      json(200, USER),
      json(200, USER),
    ]);

    const first = client.request('/v1/me');
    const second = client.request('/v1/me');

    await expect(Promise.all([first, second])).resolves.toEqual([USER, USER]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(authOf(2)).toBe(`Bearer ${FRESH}`);
    expect(authOf(3)).toBe(`Bearer ${FRESH}`);
  });
});
