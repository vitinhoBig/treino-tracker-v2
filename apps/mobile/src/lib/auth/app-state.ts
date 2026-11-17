import { AppState, Platform } from 'react-native';

import type { AppStateLike } from './auto-refresh';

/**
 * React Native's AppState on iOS and Android, and nothing on web. A browser tells the page itself
 * when its tab is hidden: supabase-js pauses its refresh timer, and TanStack Query listens for
 * `visibilitychange`, so neither needs the app to say so.
 */
export function platformAppState(): AppStateLike | null {
  return Platform.OS === 'web' ? null : AppState;
}
