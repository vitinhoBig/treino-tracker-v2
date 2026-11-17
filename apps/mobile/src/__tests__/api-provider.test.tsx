import { render } from '@testing-library/react-native';

import { createApiClient, type ApiClient } from '@/lib/api/client';
import { ApiProvider, useApi } from '@/lib/api/provider';
import { SessionProvider, useSession, type SessionValue } from '@/lib/auth/session';
import { getConfig } from '@/lib/config';
import { fakeAuth } from '@/test-support/fake-auth';

jest.mock('@/lib/config', () => ({ getConfig: jest.fn(() => ({ apiUrl: 'http://api.test' })) }));
jest.mock('@/lib/api/client', () => ({
  createApiClient: jest.fn(() => ({ request: jest.fn(async () => ({ id: 'x' })) })),
}));

const createClient = jest.mocked(createApiClient);

async function renderApi() {
  const auth = fakeAuth();
  const seen: { api: ApiClient | null; session: SessionValue | null } = { api: null, session: null };
  function Probe() {
    seen.api = useApi();
    seen.session = useSession();
    return null;
  }
  await render(
    <SessionProvider auth={auth.auth} appState={null}>
      <ApiProvider>
        <Probe />
      </ApiProvider>
    </SessionProvider>,
  );
  return { ...auth, seen };
}

afterEach(() => jest.clearAllMocks());

describe('ApiProvider', () => {
  // `expo export` renders pages in Node without the app's .env, and reading the config throws then.
  it('reads the config and builds the client only on the first request, never while rendering', async () => {
    const { seen } = await renderApi();

    expect(getConfig).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();

    await seen.api!.request('/v1/me');
    await seen.api!.request('/v1/me');

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('points the client at the API, and leaves retries to the query layer', async () => {
    const { seen } = await renderApi();

    await seen.api!.request('/v1/me');

    expect(createClient.mock.calls[0][0]).toMatchObject({ baseUrl: 'http://api.test', unavailableRetries: 0 });
  });

  it('gives the client the session: its token, its refresh and a local sign-out', async () => {
    const { seen, auth } = await renderApi();
    await seen.api!.request('/v1/me');
    const deps = createClient.mock.calls[0][0];

    expect(deps.getAccessToken).toBe(seen.session!.getAccessToken);
    expect(deps.refreshSession).toBe(seen.session!.refreshSession);
    await expect(deps.getAccessToken()).resolves.toBe('a');
    await deps.signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('keeps the same client when the session changes', async () => {
    const { seen, emit } = await renderApi();
    const before = seen.api;

    await emit('INITIAL_SESSION', null);

    expect(seen.api).toBe(before);
  });
});

describe('useApi', () => {
  it('explains the mistake when used outside the provider', async () => {
    function Lonely() {
      useApi();
      return null;
    }
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(render(<Lonely />)).rejects.toThrow('inside <ApiProvider>');
  });
});
