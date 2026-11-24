import * as SplashScreen from 'expo-splash-screen';

import { ApiProvider } from '@/lib/api/provider';
import { RootNavigator } from '@/lib/auth/root-navigator';
import { SessionProvider } from '@/lib/auth/session';
import { SplashGate } from '@/lib/auth/splash-gate';
import '@/lib/i18n';
import { QueryProvider } from '@/lib/query/provider';

// Keep the splash screen up until SplashGate hides it, once the stored session has loaded.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <ApiProvider>
        <QueryProvider>
          <SplashGate />
          <RootNavigator />
        </QueryProvider>
      </ApiProvider>
    </SessionProvider>
  );
}
