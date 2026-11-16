// A key-value storage that splits long values into chunks, for stores with a small value limit.
//
// SecureStore (iOS Keychain, Android Keystore) may refuse values over 2048 bytes, and a Supabase
// session is about 2.1 KB. So a value is cut into chunks of at most `chunkBytes` UTF-8 bytes,
// and a small manifest under the original key says where the chunks are.
//
// Each single write to the store is atomic, but a chunked write is several writes, and the app
// can be killed between them. To make the whole value change at once, chunks are written to one
// of two slots (a, b): the new value goes to the slot that is NOT live, and the manifest write
// that points at it is the commit. A crash before that leaves the old manifest pointing at old,
// intact chunks. A reader that finds any chunk missing returns null ("no session"), never a
// partial string that would parse as corrupt JSON.

// The part of expo-secure-store this file uses, so tests can pass an in-memory fake.
export type KeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

// The shape Supabase's `auth.storage` option accepts.
export type SessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// Under SecureStore's 2048-byte limit, with a margin.
export const DEFAULT_CHUNK_BYTES = 1800;

type Slot = 'a' | 'b';
type Manifest = { slot: Slot; count: number };

// SecureStore keys may only contain letters, digits, '.', '-' and '_'.
const KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

// The number of bytes a code point takes in UTF-8. A lone surrogate is encoded as U+FFFD (3 bytes).
function codePointBytes(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) bytes += codePointBytes(char.codePointAt(0)!);
  return bytes;
}

// Splits text into pieces of at most `maxBytes` UTF-8 bytes. It walks by code point, so an emoji
// (two UTF-16 units, four bytes) is never cut in half.
export function splitByBytes(text: string, maxBytes: number): string[] {
  if (maxBytes < 4) throw new RangeError('maxBytes must fit any character (at least 4)');
  const pieces: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of text) {
    const size = codePointBytes(char.codePointAt(0)!);
    if (currentBytes + size > maxBytes) {
      pieces.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  if (current !== '' || pieces.length === 0) pieces.push(current);
  return pieces;
}

function chunkKey(key: string, slot: Slot, index: number): string {
  return `${key}.${slot}.${index}`;
}

function parseManifest(raw: string | null): Manifest | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { slot, count } = value as Record<string, unknown>;
    if ((slot !== 'a' && slot !== 'b') || !Number.isInteger(count) || (count as number) < 1) {
      return null;
    }
    return { slot, count: count as number };
  } catch {
    return null;
  }
}

export function createChunkedStorage(
  store: KeyValueStore,
  { chunkBytes = DEFAULT_CHUNK_BYTES }: { chunkBytes?: number } = {},
): SessionStorage {
  function checkKey(key: string) {
    if (!KEY_PATTERN.test(key)) throw new Error(`Storage key has characters SecureStore refuses: ${key}`);
  }

  // Deletes a slot's chunks from `from` up to the first missing one. Probing finds chunks left by
  // a write that crashed before its manifest, whose count was never recorded. Deleting from the
  // top down means a crash here leaves an unbroken run, which the next probe still finds.
  async function deleteChunks(key: string, slot: Slot, from: number) {
    let end = from;
    while ((await store.getItemAsync(chunkKey(key, slot, end))) !== null) end += 1;
    for (let index = end - 1; index >= from; index -= 1) {
      await store.deleteItemAsync(chunkKey(key, slot, index));
    }
  }

  return {
    async getItem(key) {
      checkKey(key);
      const manifest = parseManifest(await store.getItemAsync(key));
      if (manifest === null) return null;
      const chunks: string[] = [];
      for (let index = 0; index < manifest.count; index += 1) {
        const chunk = await store.getItemAsync(chunkKey(key, manifest.slot, index));
        if (chunk === null) return null;
        chunks.push(chunk);
      }
      return chunks.join('');
    },

    async setItem(key, value) {
      checkKey(key);
      const live = parseManifest(await store.getItemAsync(key));
      const slot: Slot = live?.slot === 'a' ? 'b' : 'a';
      const chunks = splitByBytes(value, chunkBytes);
      for (const [index, chunk] of chunks.entries()) {
        await store.setItemAsync(chunkKey(key, slot, index), chunk);
      }
      // Leftovers in the new slot from an older, longer value or a crashed write.
      await deleteChunks(key, slot, chunks.length);
      // The commit: from here on readers see the new value.
      await store.setItemAsync(key, JSON.stringify({ slot, count: chunks.length } satisfies Manifest));
      // The old value, or chunks left by a removal that crashed part-way.
      await deleteChunks(key, slot === 'a' ? 'b' : 'a', 0);
    },

    async removeItem(key) {
      checkKey(key);
      // The manifest goes first, so a crash part-way leaves "no session", not half a session.
      await store.deleteItemAsync(key);
      await deleteChunks(key, 'a', 0);
      await deleteChunks(key, 'b', 0);
    },
  };
}
