// A fake supabase.auth for tests, shared by the session and query tests. Not under __tests__, which
// Jest would run as a test file, and not under src/app, where every file becomes a route.
import type { AuthChangeEvent, AuthError, Session } from '@supabase/supabase-js';
import { act } from '@testing-library/react-native';

import type { SessionAuth } from '@/lib/auth/session';

type SessionResult = { data: { session: Session | null }; error: AuthError | null };

export const SESSION = { access_token: 'a', refresh_token: 'r', user: { id: 'u1' } } as unknown as Session;

/** A fake supabase.auth. `emit` plays the part of Supabase firing an auth event. */
export function fakeAuth() {
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
    getSession: jest.fn(async (): Promise<SessionResult> => ({ data: { session: SESSION }, error: null })),
    refreshSession: jest.fn(async (): Promise<SessionResult> => ({ data: { session: SESSION }, error: null })),
    startAutoRefresh: jest.fn(async () => {}),
    stopAutoRefresh: jest.fn(async () => {}),
  } satisfies SessionAuth;
  const emit = (event: AuthChangeEvent, session: Session | null) => act(() => callback?.(event, session));
  return { auth, emit, unsubscribe };
}
