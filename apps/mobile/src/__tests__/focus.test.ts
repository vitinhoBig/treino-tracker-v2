import type { AppStateLike } from '@/lib/auth/auto-refresh';
import { bindFocusManager } from '@/lib/query/focus';

function fakeAppState(currentState: string | null | undefined) {
  let listener: ((state: string) => void) | null = null;
  const remove = jest.fn(() => {
    listener = null;
  });
  const appState = {
    currentState,
    addEventListener: jest.fn((_type: 'change', cb: (state: string) => void) => {
      listener = cb;
      return { remove };
    }),
  } as unknown as AppStateLike;
  return { appState, remove, change: (state: string) => listener?.(state), listening: () => listener !== null };
}

describe('bindFocusManager', () => {
  it('starts focused when the app is active and unfocused when it is not', () => {
    for (const [state, focused] of [
      ['active', true],
      ['background', false],
      ['inactive', false],
    ] as const) {
      const manager = { setFocused: jest.fn() };

      bindFocusManager(manager, fakeAppState(state).appState);

      expect(manager.setFocused).toHaveBeenLastCalledWith(focused);
    }
  });

  it('follows the app to the background and back', () => {
    const manager = { setFocused: jest.fn() };
    const fake = fakeAppState('active');
    bindFocusManager(manager, fake.appState);

    fake.change('background');
    expect(manager.setFocused).toHaveBeenLastCalledWith(false);

    fake.change('active');
    expect(manager.setFocused).toHaveBeenLastCalledWith(true);
  });

  // Claiming "background" before the state is known would stop refetching on a cold start.
  it.each([null, undefined])('leaves it to Query when the state is not known yet (%s)', (state) => {
    const manager = { setFocused: jest.fn() };

    bindFocusManager(manager, fakeAppState(state).appState);

    expect(manager.setFocused).toHaveBeenLastCalledWith(undefined);
  });

  it('stops listening and hands focus back to Query when undone', () => {
    const manager = { setFocused: jest.fn() };
    const fake = fakeAppState('active');
    const undo = bindFocusManager(manager, fake.appState);

    undo();

    expect(fake.remove).toHaveBeenCalledTimes(1);
    expect(fake.listening()).toBe(false);
    expect(manager.setFocused).toHaveBeenLastCalledWith(undefined);
  });
});
