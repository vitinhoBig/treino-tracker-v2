// Session storage for iOS and Android: the device's encrypted store (Keychain or Keystore),
// chunked because a Supabase session is larger than one SecureStore value may be.
// Web builds use secure-storage.web.ts instead; Metro picks the file by platform.
import * as SecureStore from 'expo-secure-store';

import { createChunkedStorage } from './chunked-storage';

export const secureStorage = createChunkedStorage(SecureStore);

// TODO(victor): SecureStore's default keychainAccessible is WHEN_UNLOCKED, so the session can't be
// read while the phone is locked. That is fine while we only refresh in the foreground. If we ever
// refresh in the background, look at SecureStore.AFTER_FIRST_UNLOCK and what it trades away.
