import { act, screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/errors';
import i18n from '@/lib/i18n';
import { sessionOf } from '@/test-support/app-providers';
import { renderApp, resetLanguage } from '@/test-support/render-app';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(async () => {}) }));

async function openHome(options?: Parameters<typeof renderApp>[1]) {
  const app = await renderApp('/', options);
  await app.emit('INITIAL_SESSION', sessionOf('alice'));
  return { ...app, user: userEvent.setup() };
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(async () => {
  jest.clearAllMocks();
  await resetLanguage();
});

describe('the home screen', () => {
  it('greets the user and shows the date', async () => {
    await openHome();

    expect(await screen.findByText('Hello, treino-tracker')).toBeTruthy();
    expect(screen.getByText(/Today: \d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/)).toBeTruthy();
  });

  it('shows the account id the API reports', async () => {
    const { api } = await openHome();

    expect(await screen.findByText('Your account id: alice')).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/v1/me', expect.anything());
  });

  it('says it is loading until the API answers', async () => {
    let answer: (value: { id: string }) => void = () => {};
    const app = await renderApp('/');
    app.api.request.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await app.emit('INITIAL_SESSION', sessionOf('alice'));

    expect(await screen.findByText('Loading your account…')).toBeTruthy();
    await act(async () => answer({ id: 'alice' }));
    expect(await screen.findByText('Your account id: alice')).toBeTruthy();
    expect(screen.queryByText('Loading your account…')).toBeNull();
  });

  it('says so when the API refuses, and lets the user try again', async () => {
    const { user, api } = await openHome({ apiReplies: [new ApiError(403, 'forbidden', 'no')] });

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your account.");
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Your account id: alice')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it('signs out on this device and returns to the sign-in screen', async () => {
    const app = await openHome();
    await screen.findByText('Your account id: alice');

    await app.user.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(app.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await app.emit('SIGNED_OUT', null);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });

  it('speaks Brazilian Portuguese', async () => {
    await i18n.changeLanguage('pt-BR');
    await openHome();

    expect(await screen.findByText('Olá, treino-tracker')).toBeTruthy();
    expect(screen.getByText(/Hoje: \d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/)).toBeTruthy();
    expect(await screen.findByText('O id da sua conta: alice')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy();
  });
});
