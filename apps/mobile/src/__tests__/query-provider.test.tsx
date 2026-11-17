import type { Session } from '@supabase/supabase-js';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text, type AppStateStatus } from 'react-native';

import type { ApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { ApiProvider } from '@/lib/api/provider';
import { meKey, useMe } from '@/lib/api/use-me';
import { SessionProvider } from '@/lib/auth/session';
import { createQueryClient } from '@/lib/query/client';
import { QueryProvider } from '@/lib/query/provider';
import { fakeAuth, SESSION } from '@/test-support/fake-auth';

const sessionOf = (id: string) => ({ ...SESSION, user: { id } }) as unknown as Session;
const ALICE = sessionOf('alice');
const BOB = sessionOf('bob');

// An API whose /v1/me answers with whoever `signedInAs.id` names, like the real one answers from the token.
function fakeApi(replies: (Error | 'ok')[] = []) {
  const signedInAs = { id: 'alice' };
  const request = jest.fn(async (_path: string, _options?: unknown) => {
    const reply = replies.shift() ?? 'ok';
    if (reply !== 'ok') throw reply;
    return { id: signedInAs.id };
  });
  return { client: { request } as unknown as ApiClient, request, signedInAs };
}

function Probe() {
  const me = useMe();
  return <Text>{`${me.status}:${me.data?.id ?? '-'}`}</Text>;
}

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

async function renderApp(api: ApiClient, appState: Parameters<typeof QueryProvider>[0]['appState'] = null) {
  const auth = fakeAuth();
  const queryClient = createQueryClient();
  clients.push(queryClient);
  queryClient.setDefaultOptions({
    queries: {
      ...queryClient.getDefaultOptions().queries,
      retryDelay: 0, // waiting a second between tries would only slow the tests down
      gcTime: Infinity, // no five-minute garbage-collection timer to hold the test run open
    },
  });
  const view = await render(
    <SessionProvider auth={auth.auth} appState={null}>
      <ApiProvider client={api}>
        <QueryProvider client={queryClient} appState={appState}>
          <Probe />
        </QueryProvider>
      </ApiProvider>
    </SessionProvider>,
  );
  return { ...auth, queryClient, view };
}

afterEach(() => focusManager.setFocused(undefined));

describe('useMe', () => {
  it('asks the API only once someone is signed in, and shows the answer', async () => {
    const { client, request } = fakeApi();
    const { emit } = await renderApp(client);

    await emit('INITIAL_SESSION', null);
    expect(request).not.toHaveBeenCalled();

    await emit('SIGNED_IN', ALICE);

    expect(await screen.findByText('success:alice')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('/v1/me');
    expect(request.mock.calls[0][1]).toMatchObject({ signal: expect.anything() }); // so leaving the screen cancels it
  });

  it('does not repeat a request the API refused with a 4xx', async () => {
    const { client, request } = fakeApi([new ApiError(403, 'anonymous_user', 'no')]);
    const { emit } = await renderApp(client);

    await emit('INITIAL_SESSION', ALICE);

    expect(await screen.findByText('error:-')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('tries again when the API is unavailable, and shows the answer once it is back', async () => {
    const unavailable = new ApiError(503, 'auth_unavailable', 'later');
    const { client, request } = fakeApi([unavailable, unavailable]);
    const { emit } = await renderApp(client);

    await emit('INITIAL_SESSION', ALICE);

    expect(await screen.findByText('success:alice')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(3);
  });
});

describe('the cache belongs to the person signed in', () => {
  it('keeps each person in their own cache entry', () => {
    expect(meKey('alice')).not.toEqual(meKey('bob'));
    expect(meKey(null)).not.toEqual(meKey('alice'));
  });

  it('is emptied on sign-out', async () => {
    const { client } = fakeApi();
    const { emit, queryClient } = await renderApp(client);
    await emit('INITIAL_SESSION', ALICE);
    await screen.findByText('success:alice');

    await emit('SIGNED_OUT', null);

    await waitFor(() => expect(screen.getByText('pending:-')).toBeTruthy());
    // The signed-out screen keeps an empty placeholder query. What matters is that nothing in the
    // cache holds the first person's data.
    expect(queryClient.getQueryData(['me', 'alice'])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll().filter((query) => query.state.data !== undefined)).toEqual([]);
  });

  it('never shows the first person to the next one, and loads the next one fresh', async () => {
    const { client, request, signedInAs } = fakeApi();
    const { emit } = await renderApp(client);
    await emit('INITIAL_SESSION', ALICE);
    await screen.findByText('success:alice');

    await emit('SIGNED_OUT', null);
    signedInAs.id = 'bob';
    await emit('SIGNED_IN', BOB);

    expect(await screen.findByText('success:bob')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(2);
  });

  // Supabase reports a sign-in as someone else with no sign-out in between.
  it('also handles a sign-in as someone else with no sign-out in between', async () => {
    const { client, request, signedInAs } = fakeApi();
    const { emit, queryClient } = await renderApp(client);
    await emit('INITIAL_SESSION', ALICE);
    await screen.findByText('success:alice');

    signedInAs.id = 'bob';
    await emit('SIGNED_IN', BOB);

    expect(await screen.findByText('success:bob')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(['me', 'alice'])).toBeUndefined();
  });

  // Nothing is left to clear at that point, and clearing then would be work for nothing.
  it('clears once when the first person leaves, not again when the next one signs in', async () => {
    const { client } = fakeApi();
    const { emit, queryClient } = await renderApp(client);
    const clear = jest.spyOn(queryClient, 'clear');
    await emit('INITIAL_SESSION', ALICE);
    await screen.findByText('success:alice');

    await emit('SIGNED_OUT', null);
    await emit('SIGNED_IN', BOB);

    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('keeps the data when the same person gets a fresh token', async () => {
    const { client, request } = fakeApi();
    const { emit } = await renderApp(client);
    await emit('INITIAL_SESSION', ALICE);
    await screen.findByText('success:alice');

    await emit('TOKEN_REFRESHED', { ...ALICE, access_token: 'new' } as Session);

    expect(screen.getByText('success:alice')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('QueryProvider and the app state', () => {
  function fakeAppState(currentState: AppStateStatus) {
    let listener: ((state: AppStateStatus) => void) | null = null;
    return {
      appState: {
        currentState,
        addEventListener: (_type: 'change', cb: (state: AppStateStatus) => void) => {
          listener = cb;
          return {
            remove() {
              listener = null;
            },
          };
        },
      },
      change: (state: AppStateStatus) => act(() => listener?.(state)),
    };
  }

  it('tells Query when the app goes to the background and comes back', async () => {
    const fake = fakeAppState('active');
    await renderApp(fakeApi().client, fake.appState);
    expect(focusManager.isFocused()).toBe(true);

    await fake.change('background');
    expect(focusManager.isFocused()).toBe(false);

    await fake.change('active');
    expect(focusManager.isFocused()).toBe(true);
  });

  it('gives focus back to Query when it unmounts', async () => {
    const fake = fakeAppState('background');
    const { view } = await renderApp(fakeApi().client, fake.appState);
    expect(focusManager.isFocused()).toBe(false);

    await view.unmount();

    expect(focusManager.isFocused()).toBe(true);
  });
});

describe('createQueryClient', () => {
  it('uses the retry rule and no retries for writes', () => {
    const client: QueryClient = createQueryClient();

    expect(client.getDefaultOptions().queries?.retry).toBeInstanceOf(Function);
    expect(client.getDefaultOptions().mutations?.retry).toBeUndefined(); // Query's own default is none
  });
});
