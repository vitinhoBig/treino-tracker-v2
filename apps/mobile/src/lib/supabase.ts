// The app's one Supabase client.
//
// It is created on first use, not when this file is imported. `expo export` renders pages in Node
// without the app's .env (CI has none), and creating the client reads the config, which would throw.
// Effects don't run while rendering to HTML, so code that calls this from an effect is safe there.
//
// No URL polyfill: Supabase's quickstart still imports react-native-url-polyfill, but Expo installs
// a standards-based URL and URLSearchParams globally (expo/src/winter/runtime.native.ts), and
// Expo's Supabase guide says Expo projects don't need it.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getConfig } from './config';
import { secureStorage } from './storage/secure-storage';

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (client === undefined) {
    // getConfig refuses a secret key, so only the publishable key, which RLS limits, ships here.
    const { supabaseUrl, supabasePublishableKey } = getConfig();
    client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        // Metro picks secure-storage.web.ts for web builds and secure-storage.ts for the phones.
        storage: secureStorage,
        persistSession: true,
        autoRefreshToken: true,
        // Sessions never arrive in a URL here: sign-in is by email and password, not a redirect.
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
