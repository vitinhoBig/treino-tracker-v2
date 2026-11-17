import {
  createChunkedStorage,
  DEFAULT_CHUNK_BYTES,
  splitByBytes,
  utf8ByteLength,
  type KeyValueStore,
} from '@/lib/storage/chunked-storage';

const KEY = 'sb-test-auth-token';
const SECURE_STORE_LIMIT = 2048;

// Bytes as the platform's encoder counts them, independent of the code under test.
const bytes = (text: string) => new TextEncoder().encode(text).length;

// An in-memory SecureStore that refuses values over its limit, like the real one may.
// `failAfter` makes the n-th write or delete throw, to stand in for the app being killed.
function fakeStore({ limit = SECURE_STORE_LIMIT } = {}) {
  const data = new Map<string, string>();
  let changesLeft = Infinity;
  const change = () => {
    if (changesLeft <= 0) throw new Error('app killed');
    changesLeft -= 1;
  };
  const store: KeyValueStore = {
    async getItemAsync(key) {
      return data.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      if (bytes(value) > limit) throw new Error(`value over ${limit} bytes`);
      change();
      data.set(key, value);
    },
    async deleteItemAsync(key) {
      change();
      data.delete(key);
    },
  };
  return {
    store,
    data,
    failAfter(changes: number) {
      changesLeft = changes;
    },
    heal() {
      changesLeft = Infinity;
    },
  };
}

// A session-like JSON value. Real sessions are about 2.1 KB (2071 bytes measured locally).
// `fill` makes two values differ from the first chunk on, so a mix of old and new chunks shows.
const session = (padding: number, fill = 'x') =>
  JSON.stringify({ access_token: fill.repeat(padding), refresh_token: 'r'.repeat(12), user: { id: 'u1' } });

describe('utf8ByteLength', () => {
  it.each(['a', 'é', '€', '💪', 'João 💪 treino'])('counts %s like TextEncoder does', (text) => {
    expect(utf8ByteLength(text)).toBe(bytes(text));
  });
});

describe('splitByBytes', () => {
  it('keeps a short value in one piece', () => {
    expect(splitByBytes('hello', 10)).toEqual(['hello']);
  });

  it('keeps an empty value as one empty piece', () => {
    expect(splitByBytes('', 10)).toEqual(['']);
  });

  // Several limits, so cuts land at every position relative to the multi-byte characters.
  it.each([4, 5, 6, 7, 8, 9, 10])('cuts by bytes and never inside a character (limit %i)', (limit) => {
    const text = 'aé€💪'.repeat(20);
    const pieces = splitByBytes(text, limit);

    expect(pieces.join('')).toBe(text);
    for (const piece of pieces) {
      expect(bytes(piece)).toBeLessThanOrEqual(limit);
      // A cut emoji leaves a lone surrogate, which does not survive a UTF-8 round trip.
      expect(new TextDecoder().decode(new TextEncoder().encode(piece))).toBe(piece);
    }
  });

  it('refuses a limit too small for a 4-byte character', () => {
    expect(() => splitByBytes('a', 3)).toThrow(RangeError);
  });
});

describe('createChunkedStorage', () => {
  it('stays under the SecureStore limit by default', () => {
    expect(DEFAULT_CHUNK_BYTES).toBeLessThanOrEqual(SECURE_STORE_LIMIT);
  });

  it('reads nothing when nothing was stored', async () => {
    const storage = createChunkedStorage(fakeStore().store);

    expect(await storage.getItem(KEY)).toBeNull();
  });

  it('round-trips a session larger than one SecureStore value', async () => {
    const { store, data } = fakeStore();
    const storage = createChunkedStorage(store);
    const value = session(5000);

    await storage.setItem(KEY, value);

    expect(await storage.getItem(KEY)).toBe(value);
    expect(data.size).toBeGreaterThan(2); // the manifest and at least two chunks
    for (const stored of data.values()) expect(bytes(stored)).toBeLessThanOrEqual(DEFAULT_CHUNK_BYTES);
  });

  it('reads a missing chunk as no session, not as a partial value', async () => {
    const { store, data } = fakeStore();
    const storage = createChunkedStorage(store);
    await storage.setItem(KEY, session(5000));

    data.delete(`${KEY}.a.1`);

    expect(await storage.getItem(KEY)).toBeNull();
  });

  it.each(['not json', '{"slot":"c","count":2}', '{"slot":"a","count":0}', '{"slot":"a"}', 'null'])(
    'reads a broken manifest (%s) as no session',
    async (manifest) => {
      const { store, data } = fakeStore();
      const storage = createChunkedStorage(store);
      await storage.setItem(KEY, session(5000));

      data.set(KEY, manifest);

      expect(await storage.getItem(KEY)).toBeNull();
    },
  );

  it('replaces a longer value with a shorter one and leaves no old chunks', async () => {
    const { store, data } = fakeStore();
    const storage = createChunkedStorage(store);
    await storage.setItem(KEY, session(9000));

    await storage.setItem(KEY, 'short');

    expect(await storage.getItem(KEY)).toBe('short');
    expect([...data.keys()].sort()).toEqual([KEY, `${KEY}.b.0`]);
  });

  it('alternates slots and keeps only the live one', async () => {
    const { store, data } = fakeStore();
    const storage = createChunkedStorage(store);
    await storage.setItem(KEY, session(9000)); // slot a, several chunks
    await storage.setItem(KEY, 'one'); // slot b

    await storage.setItem(KEY, 'two'); // slot a again

    expect(await storage.getItem(KEY)).toBe('two');
    expect([...data.keys()].sort()).toEqual([KEY, `${KEY}.a.0`]);
  });

  it('clears every chunk on removal', async () => {
    const { store, data } = fakeStore();
    const storage = createChunkedStorage(store);
    await storage.setItem(KEY, session(9000));

    await storage.removeItem(KEY);

    expect(await storage.getItem(KEY)).toBeNull();
    expect(data.size).toBe(0);
  });

  it('keeps the old value whole when the app dies part-way through a write', async () => {
    const fake = fakeStore();
    const storage = createChunkedStorage(fake.store);
    const old = session(5000, 'o');
    await storage.setItem(KEY, old);

    fake.failAfter(1); // one new chunk lands, then the app dies before the manifest
    await expect(storage.setItem(KEY, session(9000, 'n'))).rejects.toThrow('app killed');

    expect(await storage.getItem(KEY)).toBe(old);
  });

  it('cleans up after a write that died part-way', async () => {
    const fake = fakeStore();
    const storage = createChunkedStorage(fake.store);
    await storage.setItem(KEY, 'old');
    fake.failAfter(3);
    await expect(storage.setItem(KEY, session(9000))).rejects.toThrow('app killed');
    fake.heal();

    await storage.setItem(KEY, 'new'); // slot b again, over the dead write's chunks

    expect(await storage.getItem(KEY)).toBe('new');
    expect([...fake.data.keys()].sort()).toEqual([KEY, `${KEY}.b.0`]);
  });

  it('reads no session after a removal that died part-way, and cleans up on the next write', async () => {
    const fake = fakeStore();
    const storage = createChunkedStorage(fake.store);
    await storage.setItem(KEY, 'first');
    // Slot b, so the next write goes to slot a and only cleanup can reach these chunks.
    await storage.setItem(KEY, session(9000));
    fake.failAfter(2); // the manifest and one chunk go, then the app dies
    await expect(storage.removeItem(KEY)).rejects.toThrow('app killed');
    fake.heal();

    expect(await storage.getItem(KEY)).toBeNull();

    await storage.setItem(KEY, 'new');
    expect(await storage.getItem(KEY)).toBe('new');
    expect([...fake.data.keys()].sort()).toEqual([KEY, `${KEY}.a.0`]);
  });

  it('refuses a key SecureStore would refuse', async () => {
    const storage = createChunkedStorage(fakeStore().store);

    await expect(storage.setItem('bad key/with spaces', 'x')).rejects.toThrow('characters');
  });
});

// supabase-js calls storage concurrently (a sign-out during a refresh), so operations must not
// interleave. Each test starts operations without awaiting, like the library does.
describe('createChunkedStorage with concurrent calls', () => {
  it('lets a read during a write see the old or the new value, never no session', async () => {
    const fake = fakeStore();
    let delayed = false;
    // The reader's second chunk read waits a moment, which is when a write could slip in.
    const slowStore: KeyValueStore = {
      ...fake.store,
      async getItemAsync(key) {
        if (key === `${KEY}.a.1` && !delayed) {
          delayed = true;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return fake.store.getItemAsync(key);
      },
    };
    const storage = createChunkedStorage(slowStore);
    const old = session(5000, 'o');
    const next = session(5000, 'n');
    await storage.setItem(KEY, old);

    const reading = storage.getItem(KEY);
    const writing = storage.setItem(KEY, next);

    expect([old, next]).toContain(await reading);
    await writing;
    expect(await storage.getItem(KEY)).toBe(next);
  });

  it('keeps two writes at once from mixing their chunks', async () => {
    const { store, data } = fakeStore();
    const storage = createChunkedStorage(store);
    const longer = session(9000, 'l');
    const shorter = session(3000, 's');

    await Promise.all([storage.setItem(KEY, longer), storage.setItem(KEY, shorter)]);

    expect(await storage.getItem(KEY)).toBe(shorter); // the call made last wins
    expect([...data.keys()].filter((key) => key.includes('.a.'))).toEqual([]);
  });

  it('runs the next call after one that failed', async () => {
    const storage = createChunkedStorage(fakeStore().store);

    const failing = storage.setItem('bad key', 'x');
    const next = storage.setItem(KEY, 'value');

    await expect(failing).rejects.toThrow('characters');
    await next;
    expect(await storage.getItem(KEY)).toBe('value');
  });
});

describe('non-ASCII text', () => {
  it('round-trips accents and emoji across many tiny chunks', async () => {
    const { store, data } = fakeStore();
    const storage = createChunkedStorage(store, { chunkBytes: 7 });
    const value = JSON.stringify({ user: { name: 'João 💪', note: 'treino de pernas 💪💪' } });

    await storage.setItem(KEY, value);

    expect(await storage.getItem(KEY)).toBe(value);
    expect(data.size - 1).toBeGreaterThanOrEqual(Math.ceil(bytes(value) / 7));
    for (const [key, stored] of data) {
      if (key !== KEY) expect(bytes(stored)).toBeLessThanOrEqual(7);
    }
  });
});
