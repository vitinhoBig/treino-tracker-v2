import { AuthApiError } from '@supabase/supabase-js';
import { screen, userEvent } from '@testing-library/react-native';

import i18n from '@/lib/i18n';
import { sessionOf } from '@/test-support/app-providers';
import { renderApp, resetLanguage } from '@/test-support/render-app';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(async () => {}) }));

async function openSignUp() {
  const app = await renderApp('/sign-up');
  await app.emit('INITIAL_SESSION', null);
  await screen.findByRole('heading', { name: 'Create your account' });
  return { ...app, user: userEvent.setup() };
}

async function fillIn(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
}

const createAccount = () => screen.getByRole('button', { name: 'Create account' });

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(async () => {
  jest.clearAllMocks();
  await resetLanguage();
});

describe('the sign-up form', () => {
  it('says how long the password must be, and offers sign-in to someone who has an account', async () => {
    await openSignUp();

    expect(screen.getByText('At least 6 characters.')).toBeTruthy();
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    expect(screen.getByText('Already have an account? Sign in')).toBeTruthy();
  });

  it('asks for both fields before sending anything', async () => {
    const { auth, user } = await openSignUp();

    await user.press(createAccount());
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your email.');

    await fillIn(user, 'ana@example.com', '');
    await user.press(createAccount());
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your password.');
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('sends the email without stray spaces and the password as typed', async () => {
    const { auth, user } = await openSignUp();
    await fillIn(user, ' ana@example.com ', 'secret1');

    await user.press(createAccount());

    expect(auth.signUp).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'secret1' });
  });

  it('moves on to the app when sign-up gives a session', async () => {
    const app = await openSignUp();
    await fillIn(app.user, 'ana@example.com', 'secret1');

    await app.user.press(createAccount()); // the fake answers with a session
    await app.emit('SIGNED_IN', sessionOf('alice'));

    expect(await screen.findByText('Hello, treino-tracker')).toBeTruthy();
    expect(screen.queryByText('Check your email')).toBeNull();
  });

  describe('when the account needs its email confirmed', () => {
    async function signUpWithoutSession() {
      const app = await openSignUp();
      app.auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
      await fillIn(app.user, 'ana@example.com', 'secret1');
      await app.user.press(createAccount());
      return app;
    }

    it('tells the user to check their email, naming the address, and drops the form', async () => {
      await signUpWithoutSession();

      expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeTruthy();
      expect(screen.getByText(/ana@example\.com/)).toBeTruthy();
      expect(screen.queryByLabelText('Password')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
    });

    // Supabase answers the same way for an address that already has an account, so the words
    // must not claim a new account was made.
    it('does not promise that an account was created', async () => {
      await signUpWithoutSession();

      expect(await screen.findByText(/If ana@example\.com can be used for a new account/)).toBeTruthy();
    });

    it('goes back to sign-in', async () => {
      const app = await signUpWithoutSession();
      await screen.findByRole('heading', { name: 'Check your email' });

      await app.user.press(screen.getByText('Back to sign in'));

      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    });

    it('speaks Brazilian Portuguese', async () => {
      await i18n.changeLanguage('pt-BR');
      const app = await renderApp('/sign-up');
      await app.emit('INITIAL_SESSION', null);
      const user = userEvent.setup();
      app.auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
      await user.type(await screen.findByLabelText('E-mail'), 'ana@example.com');
      await user.type(screen.getByLabelText('Senha'), 'secret1');

      await user.press(screen.getByRole('button', { name: 'Criar conta' }));

      expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeTruthy();
      expect(screen.getByText(/Se ana@example\.com puder ser usado em uma nova conta/)).toBeTruthy();
    });
  });

  it.each([
    ['a weak password', new AuthApiError('Password is too weak', 422, 'weak_password'), 'That password is too weak. Use at least 6 characters.'],
    ['an address that is already taken', new AuthApiError('User already registered', 422, 'user_already_exists'), "We couldn't create this account. If you already have one, try signing in."],
    ['a badly formed address', new AuthApiError('Invalid email', 400, 'email_address_invalid'), "That doesn't look like an email address. Check it and try again."],
    ['too many attempts', new AuthApiError('Rate limit', 429, 'over_request_rate_limit'), 'Too many attempts. Wait a moment and try again.'],
  ])('explains %s, and keeps the form for another try', async (_name, error, message) => {
    const { auth, user } = await openSignUp();
    auth.signUp.mockResolvedValueOnce({ data: { session: null }, error } as never);
    await fillIn(user, 'ana@example.com', 'abc');

    await user.press(createAccount());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Email').props.value).toBe('ana@example.com');
    expect(screen.queryByText('Check your email')).toBeNull();
  });
});
