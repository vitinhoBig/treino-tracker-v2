import { router } from 'expo-router';
import { act, screen } from 'expo-router/testing-library';
import * as SplashScreen from 'expo-splash-screen';

import i18n from '@/lib/i18n';
import { sessionOf } from '@/test-support/app-providers';
import { renderApp, resetLanguage } from '@/test-support/render-app';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(async () => {}) }));

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(async () => {
  jest.clearAllMocks();
  await resetLanguage();
});

describe('the route guard', () => {
  it('shows the sign-in screen to someone who is signed out', async () => {
    const app = await renderApp('/');
    await app.emit('INITIAL_SESSION', null);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(app.getPathname()).toBe('/sign-in');
  });

  it('shows the home screen to someone who is signed in', async () => {
    const app = await renderApp('/');
    await app.emit('INITIAL_SESSION', sessionOf('alice'));

    expect(await screen.findByText('Hello, treino-tracker')).toBeTruthy();
    expect(app.getPathname()).toBe('/');
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });

  it('moves to the sign-in screen when the user signs out', async () => {
    const app = await renderApp('/');
    await app.emit('INITIAL_SESSION', sessionOf('alice'));
    await screen.findByText('Hello, treino-tracker');

    await app.emit('SIGNED_OUT', null);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByText('Hello, treino-tracker')).toBeNull();
    expect(app.getPathname()).toBe('/sign-in');
  });

  it('moves to the home screen when the user signs in', async () => {
    const app = await renderApp('/');
    await app.emit('INITIAL_SESSION', null);
    await screen.findByRole('heading', { name: 'Sign in' });

    await app.emit('SIGNED_IN', sessionOf('alice'));

    expect(await screen.findByText('Hello, treino-tracker')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
    expect(app.getPathname()).toBe('/');
  });

  it('lets someone who is signed out open the sign-up screen', async () => {
    const app = await renderApp('/');
    await app.emit('INITIAL_SESSION', null);
    await screen.findByRole('heading', { name: 'Sign in' });

    await act(() => router.navigate('/sign-up'));

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeTruthy();
  });

  // The guard is what keeps health data away from someone who isn't signed in, so both
  // directions are tried by address, as a link or a typed URL would.
  it('does not let someone who is signed out open the home screen by address', async () => {
    const app = await renderApp('/');
    await app.emit('INITIAL_SESSION', null);
    await screen.findByRole('heading', { name: 'Sign in' });

    await act(() => router.navigate('/'));

    expect(screen.queryByText('Hello, treino-tracker')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(app.api.request).not.toHaveBeenCalled();
  });

  it('does not let someone who is signed in open the sign-in screen by address', async () => {
    const app = await renderApp('/');
    await app.emit('INITIAL_SESSION', sessionOf('alice'));
    await screen.findByText('Hello, treino-tracker');

    await act(() => router.navigate('/sign-in'));

    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
    expect(screen.getByText('Hello, treino-tracker')).toBeTruthy();
  });

  it('keeps a signed-out visitor who opens the app on a protected address on the sign-in screen', async () => {
    const app = await renderApp('/');
    expect(app.getPathname()).not.toBe('/'); // redirected even before the stored session has loaded
    await app.emit('INITIAL_SESSION', null);

    expect(screen.queryByText('Hello, treino-tracker')).toBeNull();
  });

  it('hides the splash screen once the stored session is known', async () => {
    const app = await renderApp('/');
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

    await app.emit('INITIAL_SESSION', null);

    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });
});
