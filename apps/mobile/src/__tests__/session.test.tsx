import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, render, screen } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Text } from 'react-native';

import { SessionProvider, useSession, type SessionAuth, type SessionValue } from '@/lib/auth/session';
import { SplashGate } from '@/lib/auth/splash-gate';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(async () => {}) }));

const SESSION = { access_token: 'a', refresh_token: 'r', user: { id: 'u1' } } as unknown as Session;

// A fake supabase.auth. `emit` plays the part of Supabase firing an auth event.
function fakeAuth() {
  let callback: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;
  const unsubscribe = jest.fn(() => {
    callback = null;
  });
  const auth = {
    onAuthStateChange: jest.fn((cb: (event: AuthChangeEvent, session: Session | null) => void) => {
      callback = cb;
      return { data: { subscription: { unsubscribe } } };
    }),
    signInWithPassword: jest.fn(async () => ({ error: null })),
    signUp: jest.fn(async () => ({ data: { session: SESSION as Session | null }, error: null })),
    signOut: jest.fn(async () => ({ error: null })),
    startAutoRefresh: jest.fn(async () => {}),
    stopAutoRefresh: jest.fn(async () => {}),
  } satisfies SessionAuth;
  const emit = (event: AuthChangeEvent, session: Session | null) => act(() => callback?.(event, session));
  return { auth, emit, unsubscribe };
}

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

describe('useSession', () => {
  it('explains the mistake when used outside the provider', async () => {
    function Lonely() {
      useSession();
      return null;
    }
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(render(<Lonely />)).rejects.toThrow('inside <SessionProvider>');
  });
});

// TODO(victor): add a provider test for a token refresh. After INITIAL_SESSION with SESSION, emit
// 'TOKEN_REFRESHED' with a new session object (same shape, different access_token). Check that the
// status stays 'signedIn' and that `latest.value?.session` is the new object, not SESSION. To see it
// fail, make the onAuthStateChange callback in session.tsx ignore every event except INITIAL_SESSION.
