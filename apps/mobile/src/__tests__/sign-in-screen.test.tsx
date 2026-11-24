import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { screen, userEvent } from '@testing-library/react-native';
import { act } from 'expo-router/testing-library';

import i18n from '@/lib/i18n';
import { sessionOf } from '@/test-support/app-providers';
import { renderApp, resetLanguage } from '@/test-support/render-app';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(async () => {}) }));

// Opens the sign-in screen the way a signed-out user reaches it.
async function openSignIn() {
  const app = await renderApp('/');
  await app.emit('INITIAL_SESSION', null);
  await screen.findByRole('heading', { name: 'Sign in' });
  return { ...app, user: userEvent.setup() };
}

async function fillIn(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
}

const submit = () => screen.getByRole('button', { name: /^Sign in$|^Signing in…$/ });

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(async () => {
  jest.clearAllMocks();
  await resetLanguage();
});

describe('the sign-in form', () => {
  it('has an email field, a password field that hides what is typed, and a way to sign up', async () => {
    await openSignIn();

    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    expect(screen.getByText('New here? Create an account')).toBeTruthy();
  });

  it('asks for the email when it is empty, without sending anything', async () => {
    const { auth, user } = await openSignIn();
    await fillIn(user, '', 'secret1');

    await user.press(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your email.');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('asks for the password when it is empty, without sending anything', async () => {
    const { auth, user } = await openSignIn();
    await fillIn(user, 'ana@example.com', '');

    await user.press(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your password.');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('treats an email of only spaces as empty', async () => {
    const { auth, user } = await openSignIn();
    await fillIn(user, '   ', 'secret1');

    await user.press(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your email.');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('sends the email without stray spaces and the password exactly as typed', async () => {
    const { auth, user } = await openSignIn();
    await fillIn(user, '  ana@example.com ', ' pass word ');

    await user.press(submit());

    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@example.com', password: ' pass word ' });
  });

  it('shows that it is working and ignores a second press until the answer comes', async () => {
    const { auth, user } = await openSignIn();
    let answer: (value: { error: null }) => void = () => {};
    auth.signInWithPassword.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await fillIn(user, 'ana@example.com', 'secret1');

    await user.press(submit());
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Signing in…' }));
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);

    await act(async () => answer({ error: null }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it.each([
    ['a wrong email or password', new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'), "That email and password don't match. Check them and try again."],
    ['an unconfirmed email', new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'), 'Confirm your email first. The link is in your inbox.'],
    ['no connection', new AuthRetryableFetchError('Failed to fetch', 0), "We can't reach the server. Check your connection and try again."],
    ['a code nobody listed', new AuthApiError('Surprise', 400, 'something_new'), 'Something went wrong. Try again.'],
  ])('explains %s in words', async (_name, error, message) => {
    const { auth, user } = await openSignIn();
    auth.signInWithPassword.mockResolvedValueOnce({ error } as never);
    await fillIn(user, 'ana@example.com', 'secret1');

    await user.press(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('keeps what was typed after an error, and clears the error on the next try', async () => {
    const { auth, user } = await openSignIn();
    auth.signInWithPassword.mockResolvedValueOnce({
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    } as never);
    await fillIn(user, 'ana@example.com', 'wrong');
    await user.press(submit());
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Email').props.value).toBe('ana@example.com');

    await user.press(submit());

    expect(screen.queryByRole('alert')).toBeNull();
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(2);
  });

  it('shows the generic message when signing in crashes', async () => {
    const { auth, user } = await openSignIn();
    auth.signInWithPassword.mockRejectedValueOnce(new Error('boom'));
    await fillIn(user, 'ana@example.com', 'secret1');

    await user.press(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
  });

  it('leaves the sign-in screen when the session arrives', async () => {
    const app = await openSignIn();
    await fillIn(app.user, 'ana@example.com', 'secret1');

    await app.user.press(submit());
    await app.emit('SIGNED_IN', sessionOf('alice'));

    expect(await screen.findByText('Hello, treino-tracker')).toBeTruthy();
  });

  it('opens the sign-up screen', async () => {
    const { user } = await openSignIn();

    await user.press(screen.getByText('New here? Create an account'));

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeTruthy();
  });

  it('speaks Brazilian Portuguese, with "você" and no "tu"', async () => {
    await i18n.changeLanguage('pt-BR');
    const app = await renderApp('/');
    await app.emit('INITIAL_SESSION', null);
    const user = userEvent.setup();
    app.auth.signInWithPassword.mockResolvedValueOnce({
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    } as never);

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeTruthy();
    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com');
    await user.type(screen.getByLabelText('Senha'), 'errada');
    await user.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esse e-mail e essa senha não conferem. Confira os dados e tente de novo.',
    );
    expect(screen.getByText('Novo por aqui? Crie sua conta')).toBeTruthy();
  });
});

// TODO(victor): two small things for the sign-in and sign-up work.
// 1. Review the pt-BR wording in src/lib/i18n/pt-BR.json (the "auth" and "home" blocks). The voice rule
//    is in src/lib/i18n/index.ts: "você", friendly, imperative buttons, calm errors. I am least sure of
//    "Novo por aqui? Crie sua conta", "Confira os dados e tente de novo", and whether "id" should be
//    "identificador". Change any string you would not say, and keep the {{placeholders}}.
// 2. Add a test that pressing Enter on the password field signs in, like the button does. Open the
//    screen with openSignIn(), type both fields, then `await fireEvent(screen.getByLabelText('Password'),
//    'submitEditing')` (import fireEvent from '@testing-library/react-native') and expect
//    auth.signInWithPassword to have been called with the email and password. To see it fail, delete the
//    `onSubmitEditing={form.submit}` line from src/app/(auth)/sign-in.tsx.
