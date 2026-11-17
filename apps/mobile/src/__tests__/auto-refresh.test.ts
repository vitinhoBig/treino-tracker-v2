import type { AppStateStatus } from 'react-native';

import { bindAutoRefresh, type AppStateLike } from '@/lib/auth/auto-refresh';

function setup(currentState: string | null) {
  const auth = { startAutoRefresh: jest.fn(async () => {}), stopAutoRefresh: jest.fn(async () => {}) };
  let listener: ((state: AppStateStatus) => void) | null = null;
  const remove = jest.fn(() => {
    listener = null;
  });
  const appState: AppStateLike = {
    currentState,
    addEventListener: (_type, callback) => {
      listener = callback;
      return { remove };
    },
  };
  const change = (state: AppStateStatus) => listener?.(state);
  return { auth, appState, change, remove };
}

describe('bindAutoRefresh', () => {
  it('starts right away when the app is already in the foreground', () => {
    const { auth, appState } = setup('active');

    bindAutoRefresh(auth, appState);

    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
  });

  it('does not start while the app state is still unknown', () => {
    const { auth, appState } = setup(null);

    bindAutoRefresh(auth, appState);

    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
  });

  it('stops in the background and starts again in the foreground', () => {
    const { auth, appState, change } = setup('active');
    bindAutoRefresh(auth, appState);

    change('background');
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);

    change('active');
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('treats inactive (a call, the app switcher) like the background', () => {
    const { auth, appState, change } = setup('active');
    bindAutoRefresh(auth, appState);

    change('inactive');

    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('stops listening and stops refreshing when undone', () => {
    const { auth, appState, change, remove } = setup('active');
    const undo = bindAutoRefresh(auth, appState);

    undo();
    change('active');

    expect(remove).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
  });
});
