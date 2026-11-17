import type { AppStateLike } from '@/lib/auth/auto-refresh';

// The part of TanStack Query's focusManager this uses, so tests can pass a fake.
export type FocusManagerLike = { setFocused(focused?: boolean): void };

/**
 * Tells TanStack Query when the app is in the foreground, so it refetches stale data when the user
 * comes back (a query has no tab to watch on a phone). Returns a function that undoes it.
 *
 * Only 'active' counts as focused: 'inactive' on iOS is the app switcher or a phone call, and
 * the user isn't looking at the data. A state that isn't known yet (null) leaves the decision to
 * Query's own default instead of claiming the app is in the background.
 */
export function bindFocusManager(manager: FocusManagerLike, appState: AppStateLike): () => void {
  const apply = (state: string | null | undefined) => {
    manager.setFocused(state == null ? undefined : state === 'active');
  };
  apply(appState.currentState);
  const subscription = appState.addEventListener('change', apply);
  return () => {
    subscription.remove();
    manager.setFocused(undefined);
  };
}
