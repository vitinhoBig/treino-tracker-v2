import type { Session } from '@supabase/supabase-js';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Text } from 'react-native';

import { SessionProvider, useSession, type SessionAuth, type SessionValue } from '@/lib/auth/session';
import { SplashGate } from '@/lib/auth/splash-gate';
import { fakeAuth, SESSION } from '@/test-support/fake-auth';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(async () => {}) }));

// Renders the provider and exposes the latest context value.
async function renderProvider(auth: SessionAuth) {
  const latest: { value: SessionValue | null } = { value: null };
  function Probe() {
    latest.value = useSession();
    return <Text>{latest.value.status}</Text>;
  }
  const view = await render(
    <SessionProvider auth={auth} appState={null}>
      <SplashGate />
      <Probe />
    </SessionProvider>,
  );
  return { latest, view };
}

afterEach(() => jest.clearAllMocks());

describe('SessionProvider', () => {
  it('stays loading, with the splash screen up, until the stored session has loaded', async () => {
    const { auth } = fakeAuth();

    await renderProvider(auth);

    expect(screen.getByText('loading')).toBeTruthy();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });

  it('is signed out, and hides the splash screen, when nothing was stored', async () => {
    const { auth, emit } = fakeAuth();
    await renderProvider(auth);

    await emit('INITIAL_SESSION', null);

    expect(screen.getByText('signedOut')).toBeTruthy();
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('is signed in when a session was stored', async () => {
    const { auth, emit } = fakeAuth();
    const { latest } = await renderProvider(auth);

    await emit('INITIAL_SESSION', SESSION);

    expect(screen.getByText('signedIn')).toBeTruthy();
    expect(latest.value?.session).toBe(SESSION);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('follows a sign-out that Supabase reports, such as a refresh token that was revoked', async () => {
    const { auth, emit } = fakeAuth();
    await renderProvider(auth);
    await emit('INITIAL_SESSION', SESSION);

    await emit('SIGNED_OUT', null);

    expect(screen.getByText('signedOut')).toBeTruthy();
  });

  it('stops listening when it unmounts', async () => {
    const { auth, unsubscribe } = fakeAuth();
    const { view } = await renderProvider(auth);

    await view.unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('starts auto-refresh with the app in the foreground', async () => {
    const { auth } = fakeAuth();
    const appState = { currentState: 'active', addEventListener: () => ({ remove: () => {} }) };

    await render(
      <SessionProvider auth={auth} appState={appState}>
        <Text>child</Text>
      </SessionProvider>,
    );

    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('SessionProvider actions', () => {
  const credentials = { email: 'ana@example.com', password: 'correct horse' };

  it('signs in and reports success', async () => {
    const { auth } = fakeAuth();
    const { latest } = await renderProvider(auth);

    await expect(latest.value!.signIn(credentials)).resolves.toEqual({ ok: true });
    expect(auth.signInWithPassword).toHaveBeenCalledWith(credentials);
  });

  it("reports Supabase's error code when sign-in is refused", async () => {
    const { auth } = fakeAuth();
    auth.signInWithPassword.mockResolvedValueOnce({
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    } as never);
    const { latest } = await renderProvider(auth);

    await expect(latest.value!.signIn(credentials)).resolves.toEqual({
      ok: false,
      code: 'invalid_credentials',
    });
  });

  it('reports a network error when Supabase could not be reached', async () => {
    const { auth } = fakeAuth();
    auth.signInWithPassword.mockResolvedValueOnce({
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    } as never);
    const { latest } = await renderProvider(auth);

    await expect(latest.value!.signIn(credentials)).resolves.toEqual({ ok: false, code: 'network_error' });
  });

  it('signs up straight into a session when email confirmation is off', async () => {
    const { auth } = fakeAuth();
    const { latest } = await renderProvider(auth);

    await expect(latest.value!.signUp(credentials)).resolves.toEqual({ ok: true, next: 'signedIn' });
  });

  it('asks the user to check their email when sign-up returns no session', async () => {
    const { auth } = fakeAuth();
    auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    const { latest } = await renderProvider(auth);

    await expect(latest.value!.signUp(credentials)).resolves.toEqual({ ok: true, next: 'checkEmail' });
    expect(screen.getByText('loading')).toBeTruthy(); // no session appeared
  });

  it("reports Supabase's error code when sign-up is refused", async () => {
    const { auth } = fakeAuth();
    auth.signUp.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthApiError('Password is too weak', 422, 'weak_password'),
    } as never);
    const { latest } = await renderProvider(auth);

    await expect(latest.value!.signUp(credentials)).resolves.toEqual({ ok: false, code: 'weak_password' });
  });

  it('signs out of this device only', async () => {
    const { auth } = fakeAuth();
    const { latest } = await renderProvider(auth);

    await latest.value!.signOut();

    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('SessionProvider tokens for the API client', () => {
  it('gives the access token of the latest session, read fresh each time', async () => {
    const { auth } = fakeAuth();
    const { latest } = await renderProvider(auth);
    await expect(latest.value!.getAccessToken()).resolves.toBe('a');

    auth.getSession.mockResolvedValueOnce({
      data: { session: { ...SESSION, access_token: 'a2' } as Session },
      error: null,
    });

    await expect(latest.value!.getAccessToken()).resolves.toBe('a2');
  });

  it('gives null when nobody is signed in', async () => {
    const { auth } = fakeAuth();
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const { latest } = await renderProvider(auth);

    await expect(latest.value!.getAccessToken()).resolves.toBeNull();
  });

  // The API client treats null as "signed out", so a network failure must not look like null.
  it('reports a failed refresh that could not reach Supabase as a network error, not as signed out', async () => {
    const { auth } = fakeAuth();
    auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });
    const { latest } = await renderProvider(auth);

    await expect(latest.value!.getAccessToken()).rejects.toMatchObject({ code: 'network_error', status: null });
  });

  it('gives null when Supabase refused the refresh, because that session is gone', async () => {
    const { auth } = fakeAuth();
    auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'),
    });
    const { latest } = await renderProvider(auth);

    await expect(latest.value!.getAccessToken()).resolves.toBeNull();
  });

  it('refreshes the session and gives the new access token', async () => {
    const { auth } = fakeAuth();
    auth.refreshSession.mockResolvedValueOnce({
      data: { session: { ...SESSION, access_token: 'a3' } as Session },
      error: null,
    });
    const { latest } = await renderProvider(auth);

    await expect(latest.value!.refreshSession()).resolves.toBe('a3');
  });

  it('gives null when the refresh fails, whatever the reason', async () => {
    const { auth } = fakeAuth();
    auth.refreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_already_used'),
    });
    const { latest } = await renderProvider(auth);

    await expect(latest.value!.refreshSession()).resolves.toBeNull();
  });

  // The API client is built from these, so a new function on every auth event would rebuild it.
  it('keeps the same functions when the session changes', async () => {
    const { auth, emit } = fakeAuth();
    const { latest } = await renderProvider(auth);
    const before = { ...latest.value! };

    await emit('INITIAL_SESSION', SESSION);

    expect(latest.value!.getAccessToken).toBe(before.getAccessToken);
    expect(latest.value!.refreshSession).toBe(before.refreshSession);
    expect(latest.value!.signOut).toBe(before.signOut);
  });
});

describe('useSession', () => {
  it('explains the mistake when used outside the provider', async () => {
    function Lonely() {
      useSession();
      return null;
    }
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(render(<Lonely />)).rejects.toThrow('inside <SessionProvider>');
  });
  
  it('keeps the user signed in and exposes the new session after a token refresh', async () => {
    const { auth, emit } = fakeAuth();
    const { latest } = await renderProvider(auth);
    await emit('INITIAL_SESSION', SESSION);
    const refreshed: Session = { ...SESSION, access_token: 'a2' };

    await emit('TOKEN_REFRESHED', refreshed);

    expect(screen.getByText('signedIn')).toBeTruthy();
    expect(latest.value?.session).toBe(refreshed);
    expect(latest.value?.session).not.toBe(SESSION);
  });
});
