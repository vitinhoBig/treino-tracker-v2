import { Stack } from 'expo-router';

// The app proper. The root layout shows this group only to someone who is signed in.
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
