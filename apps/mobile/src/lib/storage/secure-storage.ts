// Session storage for iOS and Android: the device's encrypted store (Keychain or Keystore),
// chunked because a Supabase session is larger than one SecureStore value may be.
// Web builds use secure-storage.web.ts instead; Metro picks the file by platform.
import * as SecureStore from 'expo-secure-store';

import { createChunkedStorage } from './chunked-storage';

export const secureStorage = createChunkedStorage(SecureStore);

// WHEN_UNLOCKED allows the session to be read only while the device is unlocked.
// AFTER_FIRST_UNLOCK also allows access while locked after the first unlock since boot, reducing security.
// Keep the default for now; reconsider only if the app starts refreshing sessions in the background.