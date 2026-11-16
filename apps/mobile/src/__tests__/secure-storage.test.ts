import * as SecureStore from 'expo-secure-store';

import { secureStorage as nativeStorage } from '@/lib/storage/secure-storage';
import { secureStorage as webStorage } from '@/lib/storage/secure-storage.web';

jest.mock('expo-secure-store', () => {
  const data = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => data.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      data.delete(key);
    }),
  };
});

const KEY = 'sb-test-auth-token';
const SESSION = JSON.stringify({ access_token: 'x'.repeat(5000) });

describe('native secure storage', () => {
  it('keeps every SecureStore value under 2048 bytes and round-trips the session', async () => {
    await nativeStorage.setItem(KEY, SESSION);

    expect(await nativeStorage.getItem(KEY)).toBe(SESSION);
    const written = jest.mocked(SecureStore.setItemAsync).mock.calls.map(([, value]) => value);
    expect(written.length).toBeGreaterThan(2);
    for (const value of written) expect(new TextEncoder().encode(value).length).toBeLessThanOrEqual(2048);
  });

  it('removes the whole session', async () => {
    await nativeStorage.setItem(KEY, SESSION);

    await nativeStorage.removeItem(KEY);

    expect(await nativeStorage.getItem(KEY)).toBeNull();
    expect(await SecureStore.getItemAsync(`${KEY}.a.0`)).toBeNull();
    expect(await SecureStore.getItemAsync(`${KEY}.b.0`)).toBeNull();
  });
});

// A browser's localStorage.
function fakeLocalStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('web storage (not secure)', () => {
  // Each test swaps in its own `window`. A getter defined on Jest's global object is never called
  // (tests run inside a Node vm context), so the fakes are plain objects instead.
  const realWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')!;
  const setWindow = (value: object | undefined) => {
    if (value === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, 'window', { value, configurable: true, writable: true });
  };
  afterEach(() => {
    Object.defineProperty(globalThis, 'window', realWindow);
  });

  it('keeps the session in localStorage in a browser', async () => {
    const localStorage = fakeLocalStorage();
    setWindow({ localStorage });

    await webStorage.setItem(KEY, SESSION);

    expect(localStorage.getItem(KEY)).toBe(SESSION);
    expect(await webStorage.getItem(KEY)).toBe(SESSION);

    await webStorage.removeItem(KEY);
    expect(await webStorage.getItem(KEY)).toBeNull();
  });

  it('reads nothing, without crashing, when the browser blocks storage', async () => {
    setWindow({
      get localStorage() {
        throw new Error('SecurityError: storage is blocked');
      },
    });

    await expect(webStorage.setItem(KEY, SESSION)).resolves.toBeUndefined();
    await expect(webStorage.getItem(KEY)).resolves.toBeNull();
    await expect(webStorage.removeItem(KEY)).resolves.toBeUndefined();
  });

  it('reads and stores nothing, without crashing, when there is no window (expo export in Node)', async () => {
    setWindow(undefined);
    expect(typeof window).toBe('undefined');

    await expect(webStorage.setItem(KEY, SESSION)).resolves.toBeUndefined();
    await expect(webStorage.getItem(KEY)).resolves.toBeNull();
    await expect(webStorage.removeItem(KEY)).resolves.toBeUndefined();
  });
});
