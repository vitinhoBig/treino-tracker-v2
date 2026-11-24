import { authErrorKey } from '@/lib/auth/error-messages';
import en from '@/lib/i18n/en.json';

describe('authErrorKey', () => {
  it.each([
    ['invalid_credentials', 'auth.errors.invalid_credentials'],
    ['email_not_confirmed', 'auth.errors.email_not_confirmed'],
    ['weak_password', 'auth.errors.weak_password'],
    ['network_error', 'auth.errors.network_error'],
    ['over_request_rate_limit', 'auth.errors.rate_limited'],
    ['over_email_send_rate_limit', 'auth.errors.rate_limited'],
    ['email_address_invalid', 'auth.errors.invalid_email'],
    ['validation_failed', 'auth.errors.invalid_email'],
  ])('maps %s to %s', (code, key) => {
    expect(authErrorKey(code)).toBe(key);
  });

  // Both say the address is taken, and the wording must not confirm it.
  it.each(['user_already_exists', 'email_exists'])(
    'answers %s with a message that does not say who has an account',
    (code) => {
      expect(authErrorKey(code)).toBe('auth.errors.account_not_created');
      expect(en.auth.errors.account_not_created).not.toMatch(/already (exists|registered|in use|taken)/i);
    },
  );

  it("uses the generic message for a code nobody listed, and for the app's own unknown_error", () => {
    expect(authErrorKey('something_new_from_supabase')).toBe('auth.errors.unknown_error');
    expect(authErrorKey('unknown_error')).toBe('auth.errors.unknown_error');
    expect(authErrorKey('')).toBe('auth.errors.unknown_error');
  });

  // A plain object would answer to these names with a function from Object.prototype.
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('does not mistake %s for a code', (code) => {
    expect(authErrorKey(code)).toBe('auth.errors.unknown_error');
  });

  it('only returns keys that exist in the translations', () => {
    const codes = [
      'invalid_credentials',
      'email_not_confirmed',
      'weak_password',
      'user_already_exists',
      'email_address_invalid',
      'over_request_rate_limit',
      'network_error',
      'nope',
    ];
    for (const code of codes) {
      const key = authErrorKey(code).replace('auth.errors.', '') as keyof typeof en.auth.errors;
      expect(en.auth.errors[key]).toEqual(expect.any(String));
    }
  });
});
