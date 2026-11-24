// Who is signed in, for the whole app.
//
// Supabase's onAuthStateChange is the only source of truth. Its first event, INITIAL_SESSION,
// arrives once the stored session has been read (it arrives with null if that failed), so until
// then the status is 'loading' and the splash screen stays up. Sign-in, sign-up and sign-out don't
// set state themselves: they ask Supabase, and the event that follows updates every screen at once.
import type { AuthChangeEvent, AuthError, Session } from '@supabase/supabase-js';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { RefreshResult } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { getSupabase } from '@/lib/supabase';

import { platformAppState } from './app-state';
import { bindAutoRefresh, type AppStateLike, type AutoRefreshAuth } from './auto-refresh';

type Credentials = { email: string; password: string };

// The part of supabase.auth the provider uses, so tests can pass a fake.
export type SessionAuth = AutoRefreshAuth & {
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signInWithPassword(credentials: Credentials): Promise<{ error: AuthError | null }>;
  signUp(credentials: Credentials): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  signOut(options: { scope: 'local' }): Promise<{ error: AuthError | null }>;
  getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  refreshSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
};

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

// Codes, not messages: screens turn them into translated text.
export type AuthResult = { ok: true } | { ok: false; code: string };
export type SignUpResult = { ok: true; next: 'signedIn' | 'checkEmail' } | { ok: false; code: string };

export type SessionValue = {
  status: SessionStatus;
  session: Session | null;
  signIn(credentials: Credentials): Promise<AuthResult>;
  signUp(credentials: Credentials): Promise<SignUpResult>;
  signOut(): Promise<void>;
  /**
   * The current access token, or null when nobody is signed in. Reads the latest session, not the
   * one from the last render, and refreshes a token that is about to expire. Throws an ApiError
   * with code network_error when a needed refresh couldn't reach Supabase: the user is still signed
   * in, so that must not look like "signed out".
   */
  getAccessToken(): Promise<string | null>;
  /** Refreshes the session. Tells a refusal (sign out) from Supabase being out of reach (don't). */
  refreshSession(): Promise<RefreshResult>;
};

export const NETWORK_ERROR = 'network_error';
export const UNKNOWN_ERROR = 'unknown_error';

// Whether Supabase could not answer, as opposed to answering "no". This is the library's own line:
// it keeps the stored session after a retryable fetch error (offline, a 5xx) and drops it after any
// other refresh error, so the app agrees with what the library already did to the session.
const couldNotAnswer = (error: AuthError) => isAuthRetryableFetchError(error);

function failure(error: AuthError): { ok: false; code: string } {
  // A retryable fetch error means the request never got an answer: offline, or the server is down.
  if (isAuthRetryableFetchError(error)) return { ok: false, code: NETWORK_ERROR };
  return { ok: false, code: error.code ?? UNKNOWN_ERROR };
}

const SessionContext = createContext<SessionValue | null>(null);

type Props = {
  children: ReactNode;
  /** Defaults to the app's Supabase client. Tests pass a fake. */
  auth?: SessionAuth;
  /** Defaults to React Native's AppState on iOS and Android, and none on web. */
  appState?: AppStateLike | null;
};

export function SessionProvider({ children, auth, appState }: Props) {
  const [state, setState] = useState<{ status: SessionStatus; session: Session | null }>({
    status: 'loading',
    session: null,
  });

  // Resolved on use, never during render, so rendering pages to HTML in Node never creates a client.
  const getAuth = useMemo(() => (): SessionAuth => auth ?? getSupabase().auth, [auth]);

  useEffect(() => {
    const client = getAuth();
    const { data } = client.onAuthStateChange((_event, session) => {
      // Keep this callback synchronous: supabase-js awaits subscribers, and calling back into
      // the client from here can deadlock it during a token refresh.
      setState({ status: session ? 'signedIn' : 'signedOut', session });
    });
    const states = appState === undefined ? platformAppState() : appState;
    const unbind = states ? bindAutoRefresh(client, states) : () => {};
    return () => {
      data.subscription.unsubscribe();
      unbind();
    };
  }, [getAuth, appState]);

  // Kept apart from the state so these functions stay the same object across renders. The API
  // client is built from them, and it would otherwise be rebuilt on every auth event.
  const actions = useMemo<Omit<SessionValue, 'status' | 'session'>>(
    () => ({
      async signIn(credentials) {
        const { error } = await getAuth().signInWithPassword(credentials);
        return error ? failure(error) : { ok: true };
      },
      async signUp(credentials) {
        const { data, error } = await getAuth().signUp(credentials);
        if (error) return failure(error);
        // With email confirmation on (hosted projects), sign-up returns no session until the link
        // is clicked. Supabase answers the same way for an address that already has an account, so
        // "check your email" also avoids telling anyone which addresses are registered.
        return { ok: true, next: data.session ? 'signedIn' : 'checkEmail' };
      },
      async signOut() {
        // Local scope ends this device's session only. supabase-js removes it before any network
        // call, so signing out works offline. The SIGNED_OUT event then updates the state.
        await getAuth().signOut({ scope: 'local' });
      },
      async getAccessToken() {
        const { data, error } = await getAuth().getSession();
        if (data.session) return data.session.access_token;
        // No session plus an error means the token had run out and refreshing it failed. When the
        // failure was only reaching Supabase, the session is still stored and still good.
        if (error && couldNotAnswer(error)) {
          throw new ApiError(null, NETWORK_ERROR, 'Could not refresh the session: Supabase was unreachable.');
        }
        return null;
      },
      async refreshSession() {
        const { data, error } = await getAuth().refreshSession();
        if (error) return couldNotAnswer(error) ? { status: 'unavailable' } : { status: 'refused' };
        // A refresh that succeeds without a session has nothing to use, which is as good as refused.
        return data.session ? { status: 'refreshed', accessToken: data.session.access_token } : { status: 'refused' };
      },
    }),
    [getAuth],
  );

  const value = useMemo<SessionValue>(() => ({ ...state, ...actions }), [state, actions]);

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (value === null) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
