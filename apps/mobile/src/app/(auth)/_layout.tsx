import { Stack } from 'expo-router';

// Signed-out screens. The root layout shows this group only to someone who isn't signed in.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
