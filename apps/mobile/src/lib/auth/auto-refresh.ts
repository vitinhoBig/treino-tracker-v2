// Refreshes the session only while the app is on screen.
//
// supabase-js refreshes the access token on a timer. In a browser it pauses that timer itself when
// the tab is hidden, but a phone has no tabs, so the app tells it: start in the foreground, stop in
// the background. The OS suspends a backgrounded app's timers, so a refresh there can't be relied
// on, and starting again on return makes the client check the token right away.
import type { AppStateStatus } from 'react-native';

export type AutoRefreshAuth = {
  startAutoRefresh(): Promise<void>;
  stopAutoRefresh(): Promise<void>;
};

// The part of React Native's AppState this uses, so tests can pass a fake.
// React Native types currentState as a plain string, null before it is known.
export type AppStateLike = {
  currentState: string | null | undefined;
  addEventListener(type: 'change', listener: (state: AppStateStatus) => void): { remove(): void };
};

/** Starts and stops auto-refresh with the app state. Returns a function that undoes it. */
export function bindAutoRefresh(auth: AutoRefreshAuth, appState: AppStateLike): () => void {
  const apply = (state: string | null | undefined) => {
    if (state === 'active') void auth.startAutoRefresh();
    else void auth.stopAutoRefresh();
  };
  apply(appState.currentState);
  const subscription = appState.addEventListener('change', apply);
  return () => {
    subscription.remove();
    void auth.stopAutoRefresh();
  };
}
