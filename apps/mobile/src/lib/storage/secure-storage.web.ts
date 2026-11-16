// Session storage for web builds. THIS IS NOT SECURE STORAGE.
//
// Browsers have no Keychain. This keeps the session in localStorage, where any script running on
// the page can read it. That is acceptable for a development preview, not for real health data:
// the phone apps are the product, and web is not a supported target for signed-in use.
//
// `expo export` renders pages in Node, where there is no `window`. There it stores nothing and
// reads nothing, so rendering never crashes and never shows a signed-in state. The same goes for
// a browser that blocks storage, where touching localStorage throws.
import type { SessionStorage } from './chunked-storage';

function local(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export const secureStorage: SessionStorage = {
  async getItem(key) {
    return local()?.getItem(key) ?? null;
  },
  async setItem(key, value) {
    local()?.setItem(key, value);
  },
  async removeItem(key) {
    local()?.removeItem(key);
  },
};
