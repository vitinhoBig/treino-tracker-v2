import { createClient } from '@supabase/supabase-js';

import { getConfig } from '@/lib/config';
import { secureStorage } from '@/lib/storage/secure-storage';
import { getSupabase } from '@/lib/supabase';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ auth: {} })) }));
jest.mock('@/lib/config', () => ({
  getConfig: jest.fn(() => ({
    supabaseUrl: 'http://127.0.0.1:54321',
    supabasePublishableKey: 'sb_publishable_test',
    apiUrl: 'http://127.0.0.1:8000',
  })),
}));
jest.mock('expo-secure-store', () => ({}));

describe('getSupabase', () => {
  it('creates nothing on import, so rendering pages in Node needs no config', () => {
    expect(createClient).not.toHaveBeenCalled();
    expect(getConfig).not.toHaveBeenCalled();
  });

  it('creates one client with the publishable key and the chunked secure storage', () => {
    const first = getSupabase();
    const second = getSupabase();

    expect(first).toBe(second);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('http://127.0.0.1:54321', 'sb_publishable_test', {
      auth: {
        storage: secureStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  });
});
