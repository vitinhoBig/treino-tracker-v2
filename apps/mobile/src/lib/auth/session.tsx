// Who is signed in, for the whole app.
//
// Supabase's onAuthStateChange is the only source of truth. Its first event, INITIAL_SESSION,
// arrives once the stored session has been read (it arrives with null if that failed), so until
// then the status is 'loading' and the splash screen stays up. Sign-in, sign-up and sign-out don't
// set state themselves: they ask Supabase, and the event that follows updates every screen at once.
import type { AuthChangeEvent, AuthError, Session } from '@supabase/supabase-js';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase';

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
};

export const NETWORK_ERROR = 'network_error';
export const UNKNOWN_ERROR = 'unknown_error';

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
    // Browsers pause the timer themselves when a tab is hidden, so web needs no AppState.
    const states = appState === undefined ? (Platform.OS === 'web' ? null : AppState) : appState;
    const unbind = states ? bindAutoRefresh(client, states) : () => {};
    return () => {
      data.subscription.unsubscribe();
      unbind();
    };
  }, [getAuth, appState]);

  const value = useMemo<SessionValue>(
    () => ({
      ...state,
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
    }),
    [state, getAuth],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (value === null) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
