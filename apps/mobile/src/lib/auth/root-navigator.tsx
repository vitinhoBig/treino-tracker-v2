// Decides which screens exist: the (auth) group for someone signed out, the (app) group for
// someone signed in. A screen in the wrong group can't be opened, by link or by hand.
import { Stack } from 'expo-router';

import { useSession } from './session';

export function RootNavigator() {
  const { status } = useSession();
  const signedIn = status === 'signedIn';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* While the stored session is still loading the splash screen covers everything, and the
          navigator needs at least one group to exist, so loading counts as signed out. */}
      <Stack.Protected guard={!signedIn} redirectTo="/">
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn} redirectTo="/sign-in">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
