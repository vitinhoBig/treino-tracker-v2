// Hides the splash screen once the stored session has loaded, so the first screen the user sees
// is already the right one (signed in or not), with no flash of the sign-in form.
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { useSession } from './session';

export function SplashGate() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);
  return null;
}
