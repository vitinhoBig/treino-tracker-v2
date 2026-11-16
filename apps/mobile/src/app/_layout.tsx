import { Stack } from 'expo-router';

import '@/lib/i18n';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
