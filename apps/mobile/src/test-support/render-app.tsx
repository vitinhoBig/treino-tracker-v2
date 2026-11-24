// Renders the real screens and group layouts under the real route guard, with fakes for the network.
import { cleanup, renderRouter } from 'expo-router/testing-library';

import AppLayout from '@/app/(app)/_layout';
import HomeScreen from '@/app/(app)/index';
import AuthLayout from '@/app/(auth)/_layout';
import SignInScreen from '@/app/(auth)/sign-in';
import SignUpScreen from '@/app/(auth)/sign-up';
import i18n from '@/lib/i18n';
import { RootNavigator } from '@/lib/auth/root-navigator';
import { SplashGate } from '@/lib/auth/splash-gate';

import { fakeApi, TestProviders } from './app-providers';
import { fakeAuth } from './fake-auth';

export async function renderApp(initialUrl = '/', { apiReplies = [] as (Error | 'ok')[] } = {}) {
  const auth = fakeAuth();
  const api = fakeApi(apiReplies);
  function Root() {
    return (
      <TestProviders auth={auth.auth} api={api.client}>
        <SplashGate />
        <RootNavigator />
      </TestProviders>
    );
  }
  const view = await renderRouter(
    {
      _layout: Root,
      '(auth)/_layout': AuthLayout,
      '(auth)/sign-in': SignInScreen,
      '(auth)/sign-up': SignUpScreen,
      '(app)/_layout': AppLayout,
      '(app)/index': HomeScreen,
    },
    { initialUrl },
  );
  return { ...view, ...auth, api };
}

/** Unmounts first, so changing the language back doesn't re-render a mounted screen outside act(). */
export async function resetLanguage() {
  await cleanup();
  await i18n.changeLanguage('en');
}
