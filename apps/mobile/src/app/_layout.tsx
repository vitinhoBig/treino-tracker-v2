import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { SessionProvider } from '@/lib/auth/session';
import { SplashGate } from '@/lib/auth/splash-gate';
import '@/lib/i18n';

// Keep the splash screen up until SplashGate hides it, once the stored session has loaded.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <SplashGate />
      <Stack screenOptions={{ headerShown: false }} />
    </SessionProvider>
  );
}
